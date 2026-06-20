#!/usr/bin/env node
/**
 * Sprint 15 — smoke homolog emissão autorizada Santo André (3547809).
 * Uso: API_URL=... npm run homolog:emission:santo-andre
 */
import { homologConfig } from "./homolog-utils.mjs";

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const IBGE = "3547809";

async function main() {
  console.log("=== Homolog emissão Santo André (Sprint 15) ===\n");

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

  const tax = await fetch(`${base}/v1/tax/resolve`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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

  const customers = await fetch(`${base}/v1/customers?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const customerId = (await customers.json()).items?.[0]?.id;
  if (!customerId) {
    console.error("FALHA: sem tomador — npm run db:seed");
    process.exit(1);
  }

  const providers = await fetch(`${base}/v1/providers?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const providerId = (await providers.json()).items?.[0]?.id;
  const services = await fetch(`${base}/v1/services?limit=5`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const servicesJson = await services.json();
  const serviceId =
    servicesJson.items?.find((s) => s.service_code === "1.01")?.id ?? servicesJson.items?.[0]?.id;

  if (!providerId || !serviceId) {
    console.error("FALHA: master data emissão");
    process.exit(1);
  }

  const issue = await fetch(`${base}/v1/nf/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: `s15-santo-andre-${Date.now()}`,
      provider_id: providerId,
      customer_id: customerId,
      service_id: serviceId,
      ibge_code: IBGE,
      competence_date: "2026-06-01",
      amount_cents: 100_00,
      description: "Sprint 15 homolog Santo André",
    }),
  });
  const issueBody = await issue.json();
  if (![200, 201, 202].includes(issue.status) || issueBody.status !== "authorized") {
    console.error("FALHA emissão:", issue.status, JSON.stringify(issueBody));
    process.exit(1);
  }

  console.log("OK — emissão autorizada Santo André");
  console.log(`  issue_id: ${issueBody.issue_id}`);
  console.log(`  ibge:     ${IBGE}`);
  console.log(`  iss_rate: ${taxBody.resolved?.iss_rate}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
