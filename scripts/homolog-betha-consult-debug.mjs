#!/usr/bin/env node
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const apiSrc = path.join(root, "apps/api/src");
const importApi = (rel) => import(pathToFileURL(path.join(apiSrc, rel)).href);

const issueId = process.argv[2] ?? "c7db3c8b-55e9-44d3-ad48-9ba32a7efe62";
let protocolo = process.argv[3];

const { getDb, withTenant, closeDb } = await importApi("db/client.js");
const { resolveTenantIdBySlug } = await importApi("modules/platform/tenant-resolver.js");
const { resolveNfseCredentials } = await importApi("modules/integration/nfse/nfse-credentials.service.js");
const { getTenantSecret } = await importApi("modules/platform/secret-vault.service.js");
const { BethaDpsSoapClient } = await importApi("modules/integration/nfse/betha/betha-dps-soap.client.js");

const tenantId = await resolveTenantIdBySlug("piloto-sp");
await withTenant(tenantId, async (tx) => {
  if (!protocolo) {
    const [row] = await tx`
      SELECT focus_ref FROM exeq_core.nf_issue WHERE id = ${issueId}::uuid
    `;
    protocolo = row?.focus_ref ?? protocolo;
  }
  console.log("protocolo:", protocolo);
  const events = await tx`
    SELECT metadata, to_status::text AS to_status
    FROM exeq_core.nf_issue_event
    WHERE nf_issue_id = ${issueId}::uuid
    ORDER BY occurred_at DESC LIMIT 8
  `;
  console.log("events:", JSON.stringify(events, null, 2));

  const cert = await getTenantSecret(tx, tenantId, "betha_certificate");
  const pwd = await getTenantSecret(tx, tenantId, "betha_certificate_password");
  const creds = await resolveNfseCredentials(tx, tenantId, "betha", "3504107", {
    prestadorCnpj: "37229907000137",
  });
  const client = new BethaDpsSoapClient({
    wsdlUrl: creds.wsdlUrl,
    wsUrl: creds.wsUrl,
    certificatePfxBase64: cert,
    certificatePassword: pwd,
  });
  const r = await client.consultarStatusDps({
    tpAmb: 1,
    codigoIbge: "3504107",
    cpfCnpjPrestador: "37229907000137",
    protocolo,
  });
  console.log("consult:", JSON.stringify(r, null, 2));
});

getDb();
await closeDb();
