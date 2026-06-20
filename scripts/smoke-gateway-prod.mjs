#!/usr/bin/env node
/**
 * Sprint 19 — smoke gateway HTTP em staging/produção (GATEWAY_MOCK=false).
 * Requer: API rodando, gateway_key no vault, GATEWAY_BASE_URL do TI.
 *
 * Uso:
 *   GATEWAY_MOCK=false GATEWAY_SYNC_PROCESSING=true API_URL=https://api... npm run smoke:gateway-prod
 *
 * Exit 2 = pré-requisito TI ausente (mock ativo ou URL não configurada no servidor).
 */
import { homologConfig } from "./homolog-utils.mjs";

const gatewayMock = process.env.GATEWAY_MOCK !== "false";
const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;

async function main() {
  console.log("=== Gateway produção/staging — Sprint 19 ===\n");

  if (gatewayMock) {
    console.error("SKIP: GATEWAY_MOCK não é false — configure no servidor/API antes do smoke prod.");
    console.error("  GATEWAY_MOCK=false GATEWAY_SYNC_PROCESSING=true npm run smoke:gateway-prod");
    process.exit(2);
  }

  console.log(`API: ${base}`);
  console.log(`GATEWAY_BASE_URL (servidor): ${process.env.GATEWAY_BASE_URL ?? "(variável da API)"}\n`);

  const health = await fetch(`${base}/health`);
  const healthBody = await health.json().catch(() => ({}));
  if (health.status !== 200) {
    console.error(`FALHA health: HTTP ${health.status}`);
    process.exit(1);
  }
  if (healthBody.gateway?.mock === true) {
    console.error("FALHA: API reporta gateway.mock=true em /health — reinicie API com GATEWAY_MOCK=false");
    process.exit(1);
  }
  console.log(`OK health — gateway HTTP (${healthBody.gateway?.base_url ?? "?"})`);

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

  const customers = await fetch(`${base}/v1/customers?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const custJson = await customers.json();
  const customerId = custJson.items?.[0]?.id;
  if (!customerId) {
    console.error("FALHA: nenhum tomador");
    process.exit(1);
  }

  const create = await fetch(`${base}/v1/charges`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: `gw-prod-smoke-${Date.now()}`,
      customer_id: customerId,
      amount_cents: 100,
      due_date: "2026-12-31",
      description: "Sprint 19 gateway prod smoke",
    }),
  });
  const charge = await create.json();
  if (create.status !== 201 || charge.status !== "registered" || !charge.gateway_ref) {
    console.error("FALHA criar cobrança:", create.status, JSON.stringify(charge));
    process.exit(1);
  }

  const detail = await fetch(`${base}/v1/charges/${charge.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const detailBody = await detail.json();

  console.log("\nOK — cobrança registrada no gateway HTTP");
  console.log(`  charge_id:   ${charge.id}`);
  console.log(`  gateway_ref: ${charge.gateway_ref}`);
  console.log(`  payment_url: ${detailBody.gateway_sandbox_url ?? detailBody.gateway_payment_url ?? "—"}`);
  console.log("\nPróximo: PO/TI validar pagamento sandbox e opcionalmente:");
  console.log(`  CHARGE_ID=${charge.id} npm run prod:gateway-postdeploy`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
