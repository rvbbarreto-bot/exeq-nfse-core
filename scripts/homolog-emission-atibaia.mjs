#!/usr/bin/env node
/**
 * Homologação Focus REAL — emissão Atibaia (3504107) com polling.
 * Uso: npm run homolog:emission:atibaia
 */
import { homologConfig, homologTestAmountCents } from "./homolog-utils.mjs";

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const IBGE = "3504107";
const MUNICIPIO = "Atibaia";
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
  console.log(`=== Homolog emissão ${MUNICIPIO} (${IBGE}) — Focus Nacional ===\n`);

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

  const tax = await fetch(`${base}/v1/tax/resolve`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      ibge_code: IBGE,
      service_code: "1.01",
      tax_regime: "simples_nacional",
      competence_date: "2026-06-01",
      fiscal_profile_name: "Perfil Piloto SP",
    }),
  });
  const taxBody = await tax.json();
  if (tax.status !== 200) {
    console.error("FALHA tax/resolve:", tax.status, JSON.stringify(taxBody));
    process.exit(1);
  }

  const customers = await (await fetch(`${base}/v1/customers?limit=50`, { headers: h })).json();
  const customer =
    (homologCustomerDoc
      ? customers.items?.find((c) => c.document?.replace(/\D/g, "") === homologCustomerDoc)
      : null) ?? customers.items?.[0];
  const customerId = customer?.id;
  const providers = await (await fetch(`${base}/v1/providers?limit=5`, { headers: h })).json();
  const provider =
    providers.items?.find((p) => p.document === "37229907000137") ?? providers.items?.[0];
  const services = await (await fetch(`${base}/v1/services?limit=10`, { headers: h })).json();
  const service =
    services.items?.find((s) => s.service_code === "1.01") ?? services.items?.[0];

  if (!provider?.id || !customerId || !service?.id) {
    console.error("FALHA: master data — npm run homolog:focus:ensure-data");
    process.exit(1);
  }

  const issue = await fetch(`${base}/v1/nf/issues`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      idempotency_key: `homolog-atibaia-${Date.now()}`,
      provider_id: provider.id,
      customer_id: customerId,
      service_id: service.id,
      ibge_code: IBGE,
      competence_date: "2026-06-01",
      amount_cents: homologTestAmountCents,
      description: `Homolog Focus Nacional ${MUNICIPIO}`,
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
    const lastEvent = detail.events?.[detail.events.length - 1];
    const err = lastEvent?.metadata?.error;
    console.log(`poll ${i + 1}: ${detail.status}${detail.focus_ref ? ` ref=${detail.focus_ref}` : ""}${err ? ` err=${err}` : ""}`);

    if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
      if (detail.status === "authorized") {
        console.log("\nOK — NFS-e autorizada em homologação Focus");
        console.log(`  issue_id:    ${issueId}`);
        console.log(`  ibge:        ${IBGE} (${MUNICIPIO})`);
        console.log(`  focus_ref:   ${detail.focus_ref}`);
        console.log(`  iss_rate:    ${taxBody.resolved?.iss_rate}`);
        process.exit(0);
      }
      console.error("\nFALHA — status terminal:", detail.status);
      console.error(JSON.stringify(detail.events?.slice(-3), null, 2));
      process.exit(1);
    }
  }

  console.error("FALHA — timeout aguardando status terminal (worker rodando?)");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
