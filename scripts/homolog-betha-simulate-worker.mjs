#!/usr/bin/env node
/** Simula job BullMQ emission-worker para issue existente ou nova. */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const apiSrc = path.join(root, "apps/api/src");
async function importApi(relPath) {
  return import(pathToFileURL(path.join(apiSrc, relPath)).href);
}

async function main() {
  const issueId = process.argv[2];
  const reset = process.argv.includes("--reset");
  if (!issueId) {
    console.error("Uso: node --import tsx scripts/homolog-betha-simulate-worker.mjs <issue_id> [--reset]");
    process.exit(1);
  }

  const { getDb, withTenant, closeDb } = await importApi("db/client.js");
  const { resolveTenantIdBySlug } = await importApi("modules/platform/tenant-resolver.js");
  const { getNfIssueForProcessing } = await importApi("modules/issuance/nf-issue.service.js");
  const { processNfIssueLifecycle } = await importApi("modules/issuance/process-nf-issue.js");
  const { resolveNfseCredentials } = await importApi("modules/integration/nfse/nfse-credentials.service.js");
  const { getNfseProvider, resetNfseProviders } = await importApi(
    "modules/integration/nfse/nfse-provider.factory.js",
  );

  resetNfseProviders();
  const tenantId = await resolveTenantIdBySlug("piloto-sp");

  if (reset) {
    await withTenant(tenantId, async (tx) => {
      await tx`
        UPDATE exeq_core.nf_issue
        SET status = 'queued', focus_ref = NULL
        WHERE id = ${issueId}::uuid AND tenant_id = ${tenantId}::uuid
      `;
    });
    console.log("reset issue to queued");
  }

  await withTenant(tenantId, async (tx) => {
    const issue = await getNfIssueForProcessing(tx, tenantId, issueId);
    const providerKind = issue.nfse_provider_kind ?? "betha";
    const creds = await resolveNfseCredentials(tx, tenantId, providerKind, issue.ibge_code, {
      prestadorCnpj: issue.internal_payload?.prestador?.cnpj,
    });
    const provider = getNfseProvider(providerKind);
    console.log("before status:", issue.status);
    console.log("provider:", provider.constructor.name);
    await processNfIssueLifecycle(tx, tenantId, issueId, provider, creds, providerKind);
    const after = await getNfIssueForProcessing(tx, tenantId, issueId);
    console.log("after status:", after.status, "focus_ref:", after.focus_ref);
    const last = await tx`
      SELECT metadata FROM exeq_core.nf_issue_event
      WHERE nf_issue_id = ${issueId}::uuid
      ORDER BY occurred_at DESC LIMIT 1
    `;
    console.log("last event:", JSON.stringify(last[0]?.metadata));
  });

  getDb();
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
