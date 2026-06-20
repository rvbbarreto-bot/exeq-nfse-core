#!/usr/bin/env node
/**
 * Sprint 10/14 — smoke homolog com gateway HTTP real (GATEWAY_MOCK=false).
 * Requer: API rodando, gateway_key no vault, GATEWAY_BASE_URL apontando sandbox TI.
 * Uso: GATEWAY_MOCK=false GATEWAY_SYNC_PROCESSING=true npm run homolog:gateway-smoke
 */
import { homologConfig } from "./homolog-utils.mjs";

const gatewayMock = process.env.GATEWAY_MOCK !== "false";

async function main() {
  console.log("=== Homolog gateway HTTP real — Sprint 10 ===\n");
  if (gatewayMock) {
    console.error("FALHA: defina GATEWAY_MOCK=false para este smoke.");
    console.error("Exemplo: GATEWAY_MOCK=false GATEWAY_SYNC_PROCESSING=true npm run homolog:gateway-smoke");
    process.exit(1);
  }

  const base = process.env.API_URL ?? homologConfig.apiBase;
  const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
  const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;

  console.log(`API:            ${base}`);
  console.log(`GATEWAY_BASE_URL: ${process.env.GATEWAY_BASE_URL ?? "(env do servidor API)"}\n`);

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
    console.error("FALHA: nenhum tomador — rode npm run db:seed");
    process.exit(1);
  }

  const create = await fetch(`${base}/v1/charges`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: `gw-smoke-${Date.now()}`,
      customer_id: customerId,
      amount_cents: 100,
      due_date: "2026-12-31",
      description: "Sprint 10 gateway HTTP smoke",
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
  const payUrl = detailBody.gateway_sandbox_url;

  console.log("OK — cobrança registrada no gateway HTTP");
  console.log(`  charge_id:   ${charge.id}`);
  console.log(`  gateway_ref: ${charge.gateway_ref}`);
  console.log(`  payment_url: ${payUrl ?? "(não retornada)"}`);
  console.log("\nPróximo: validar URL de pagamento no sandbox TI e anexar evidência UAT.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
