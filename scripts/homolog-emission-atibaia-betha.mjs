#!/usr/bin/env node
/**
 * Homologação Betha (Atibaia 3504107) — provider betha + mock ou real.
 * Requer: BETHA_ATIBAIA_ENABLED=true no .env da API/worker
 * Mock: BETHA_MOCK=true (sem certificado)
 *
 * Uso: npm run homolog:emission:atibaia:betha
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig, homologTestAmountCents } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local") });

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const IBGE = "3504107";
const MUNICIPIO = "Atibaia";

function brazilToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
const homologCustomerDoc = (() => {
  const fromEnv = (process.env.HOMOLOG_CUSTOMER_DOCUMENT ?? "").replace(/\D/g, "");
  const provider = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "");
  if (fromEnv && fromEnv !== "52998224725" && fromEnv !== provider) return fromEnv;
  return "11444777000161";
})();

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const forceReal = process.argv.includes("--real");
  const mock = forceReal ? false : process.env.BETHA_MOCK !== "false";
  console.log(`=== Homolog emissão ${MUNICIPIO} (${IBGE}) — Betha ${mock ? "(MOCK)" : "(REAL)"} ===\n`);
  console.log(`Valor NFS-e teste: R$ ${(homologTestAmountCents / 100).toFixed(2)} (${homologTestAmountCents} centavos)`);
  if (!mock) {
    const portal = process.env.BETHA_PORTAL_AMBIENTE ?? "homolog";
    const tpAmb = process.env.BETHA_DPS_TP_AMB ?? "2";
    console.log(`Ambiente Betha: portal=${portal} tpAmb=${tpAmb} (homolog=2, prod=1)\n`);
  } else {
    console.log("");
  }

  if (forceReal) {
    const health = await (await fetch(`${base}/health`)).json();
    if (health.betha?.mock !== false) {
      console.error("FALHA — para --real configure BETHA_MOCK=false no .env.local e reinicie API/worker");
      process.exit(1);
    }
    if (!health.betha?.certificate_configured || !health.betha?.wsdl_configured) {
      console.error("FALHA — SOAP real requer certificado no vault + BETHA_WSDL_URL");
      console.error("  Rode: npm run homolog:betha:preflight");
      process.exit(1);
    }
  }

  const login = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (login.status !== 200 || !loginBody.access_token) {
    console.error(`FALHA login: HTTP ${login.status}`);
    process.exit(1);
  }
  const token = loginBody.access_token;
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const customers = await (await fetch(`${base}/v1/customers?limit=50`, { headers: h })).json();
  const customer =
    customers.items?.find((c) => c.document?.replace(/\D/g, "") === homologCustomerDoc) ??
    customers.items?.[0];
  const providers = await (await fetch(`${base}/v1/providers?limit=5`, { headers: h })).json();
  const provider =
    providers.items?.find((p) => p.document === (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "")) ??
    providers.items?.[0];
  const services = await (await fetch(`${base}/v1/services?limit=10`, { headers: h })).json();
  const service = services.items?.find((s) => s.service_code === "1.01") ?? services.items?.[0];

  if (!provider?.id || !customer?.id || !service?.id) {
    console.error("FALHA: master data — npm run homolog:focus:ensure-data");
    process.exit(1);
  }

  const issue = await fetch(`${base}/v1/nf/issues`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      idempotency_key: `homolog-betha-atibaia-${Date.now()}`,
      provider_id: provider.id,
      customer_id: customer.id,
      service_id: service.id,
      ibge_code: IBGE,
      competence_date: brazilToday(),
      amount_cents: homologTestAmountCents,
      description: `Homolog Betha ${MUNICIPIO}`,
    }),
  });
  const issueBody = await issue.json();
  if (![200, 201, 202].includes(issue.status) || !issueBody.issue_id) {
    console.error("FALHA emissão POST:", issue.status, JSON.stringify(issueBody));
    process.exit(1);
  }

  const issueId = issueBody.issue_id;
  console.log(`POST ${issue.status} issue_id=${issueId} status=${issueBody.status}`);

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const detail = await (await fetch(`${base}/v1/nf/issues/${issueId}`, { headers: h })).json();
    const providerKind = detail.nfse_provider_kind ?? detail.events?.find((e) => e.metadata?.provider_kind)?.metadata?.provider_kind;
    console.log(
      `poll ${i + 1}: ${detail.status}${detail.focus_ref ? ` ref=${detail.focus_ref}` : ""}${providerKind ? ` provider=${providerKind}` : ""}`,
    );

    if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
      if (detail.status === "authorized") {
        console.log("\nOK — NFS-e autorizada via Betha");
        console.log(`  issue_id:  ${issueId}`);
        console.log(`  ibge:      ${IBGE} (${MUNICIPIO})`);
        console.log(`  focus_ref: ${detail.focus_ref}`);
        process.exit(0);
      }
      const lastErr = detail.events?.slice(-1)[0]?.metadata?.error ?? "";
      if (detail.status === "rejected" && /BETHA_DPS_E130/.test(lastErr)) {
        console.log("\nREJEITADO — Betha E130: homolog DPS Nota Nacional suspenso.");
        console.log("  Integração técnica OK. Ação: chamado Betha ou migrar para produção ADN.");
        console.log(`  issue_id: ${issueId}`);
        process.exit(2);
      }
      if (detail.status === "rejected" && /BETHA_DPS_E270/.test(lastErr)) {
        console.log("\nREJEITADO — Betha E270: tpAmb desalinhado com cadastro prestador.");
        console.log("  Rode: npm run homolog:betha:tpamb-diagnose");
        process.exit(2);
      }
      console.error("\nFALHA — status terminal:", detail.status);
      console.error(JSON.stringify(detail.events?.slice(-3), null, 2));
      process.exit(1);
    }
  }

  console.error("FALHA — timeout (worker rodando? BETHA_ATIBAIA_ENABLED=true?)");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
