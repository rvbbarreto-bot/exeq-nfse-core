#!/usr/bin/env node
/**
 * Emissão Betha REAL end-to-end — processa lifecycle inline (sem depender de worker BullMQ).
 * Uso: npm run homolog:emission:atibaia:betha:real:sync
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homologConfig, homologTestAmountCents, killEmissionWorkers, flushBullNfQueues } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const apiSrc = path.join(root, "apps/api/src");
const importApi = (rel) => import(pathToFileURL(path.join(apiSrc, rel)).href);

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const IBGE = "3504107";

function brazilToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`=== Betha REAL sync (Atibaia ${IBGE}) ===\n`);
  console.log(`Valor: R$ ${(homologTestAmountCents / 100).toFixed(2)}`);
  console.log(`Portal: ${process.env.BETHA_PORTAL_AMBIENTE} tpAmb=${process.env.BETHA_DPS_TP_AMB}\n`);

  killEmissionWorkers();
  await flushBullNfQueues();

  const { getDb, withTenant, closeDb } = await importApi("db/client.js");
  const { resolveTenantIdBySlug } = await importApi("modules/platform/tenant-resolver.js");
  const { processNfIssueUntilTerminal } = await importApi("modules/issuance/process-nf-issue.js");
  const { resolveNfseCredentials } = await importApi("modules/integration/nfse/nfse-credentials.service.js");
  const { getNfseProvider, resetNfseProviders } = await importApi(
    "modules/integration/nfse/nfse-provider.factory.js",
  );
  const { getNfIssueForProcessing } = await importApi("modules/issuance/nf-issue.service.js");
  resetNfseProviders();
  const tenantId = await resolveTenantIdBySlug(process.env.HOMOLOG_TENANT_SLUG ?? "piloto-sp");

  async function processIssueInline(issueId) {
    let finalStatus = "queued";
    for (let round = 0; round < 25; round++) {
      finalStatus = await withTenant(tenantId, async (tx) => {
        const row = await getNfIssueForProcessing(tx, tenantId, issueId);
        if (row.status === "failed" || row.status === "rejected") {
          await tx`
            UPDATE exeq_core.nf_issue
            SET status = 'queued', focus_ref = NULL
            WHERE id = ${issueId}::uuid AND tenant_id = ${tenantId}::uuid
          `;
        }
        const creds = await resolveNfseCredentials(tx, tenantId, "betha", row.ibge_code, {
          prestadorCnpj: row.internal_payload?.prestador?.cnpj,
        });
        return processNfIssueUntilTerminal(tx, tenantId, issueId, getNfseProvider("betha"), creds, "betha", 2);
      });
      console.log(`round ${round + 1}: ${finalStatus}`);
      if (["authorized", "rejected", "failed", "cancelled"].includes(finalStatus)) break;
      await sleep(5000);
    }
    return finalStatus;
  }

  const health = await (await fetch(`${base}/health`)).json();
  if (health.betha?.mock !== false) {
    console.error("FALHA — BETHA_MOCK=false + certificado no vault");
    process.exit(1);
  }

  const login = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (!loginBody.access_token) {
    console.error("FALHA login");
    process.exit(1);
  }
  const h = { authorization: `Bearer ${loginBody.access_token}`, "content-type": "application/json" };

  const customers = await (await fetch(`${base}/v1/customers?limit=50`, { headers: h })).json();
  const providers = await (await fetch(`${base}/v1/providers?limit=5`, { headers: h })).json();
  const services = await (await fetch(`${base}/v1/services?limit=10`, { headers: h })).json();
  const provider =
    providers.items?.find((p) => p.document === (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "")) ??
    providers.items?.[0];
  const homologCustomerDoc = "11444777000161";
  const customer =
    customers.items?.find((c) => c.document?.replace(/\D/g, "") === homologCustomerDoc) ??
    customers.items?.[0];
  const service = services.items?.find((s) => s.service_code === "1.01") ?? services.items?.[0];

  const issue = await fetch(`${base}/v1/nf/issues`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      idempotency_key: `homolog-betha-sync-${Date.now()}`,
      provider_id: provider.id,
      customer_id: customer.id,
      service_id: service.id,
      ibge_code: IBGE,
      competence_date: brazilToday(),
      amount_cents: homologTestAmountCents,
      description: "Homolog Betha Atibaia sync",
    }),
  });
  const issueBody = await issue.json();
  if (!issueBody.issue_id) {
    console.error("FALHA POST", issue.status, issueBody);
    process.exit(1);
  }
  const issueId = issueBody.issue_id;
  console.log(`POST ${issue.status} issue_id=${issueId} status=${issueBody.status}`);

  await withTenant(tenantId, async (tx) => {
    await tx`
      UPDATE exeq_core.nf_issue
      SET status = 'queued', focus_ref = NULL
      WHERE id = ${issueId}::uuid AND tenant_id = ${tenantId}::uuid
    `;
  });
  await flushBullNfQueues();

  const finalStatus = await processIssueInline(issueId);

  const detail = await (await fetch(`${base}/v1/nf/issues/${issueId}`, { headers: h })).json();
  if (finalStatus === "authorized") {
    console.log("\nOK — NFS-e autorizada via Betha (produção ADN)");
    console.log(`  issue_id:  ${issueId}`);
    console.log(`  focus_ref: ${detail.focus_ref}`);
    getDb();
    await closeDb();
    process.exit(0);
  }

  const lastErr = detail.events?.slice(-1)[0]?.metadata?.error
    ?? detail.events?.slice(-1)[0]?.metadata?.focus_erros
    ?? detail.events?.slice(-1)[0]?.metadata?.operator;
  console.error("\nFALHA — status:", finalStatus);
  console.error(JSON.stringify(detail.events?.slice(-3), null, 2));
  if (lastErr) console.error("erro:", typeof lastErr === "object" ? JSON.stringify(lastErr) : lastErr);
  if (detail.events?.some((e) => e.metadata?.operator?.code === "BETHA_L12")) {
    console.error("\nL12 — verifique cadastro ADN (nfse.gov.br/EmissorNacional) e sincronização com prefeitura.");
  }
  getDb();
  await closeDb();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
