#!/usr/bin/env node
/**
 * UAT-17 — cria cobrança e exibe gateway_ref (homolog).
 * Uso: npm run uat:charge
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lastChargeFile = path.join(root, ".homolog", "last-charge.json");

const base = process.env.API_URL ?? "http://localhost:3002";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";

async function request(method, path, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function fail(msg) {
  console.error(`FALHA: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`UAT-17 — criar cobrança → ${base}\n`);

  const health = await request("GET", "/health");
  if (health.status !== 200) fail(`health retornou ${health.status}`);

  const login = await request("POST", "/v1/auth/login", {
    body: { email, password },
  });
  if (login.status !== 200) fail(`login ${login.status}: ${JSON.stringify(login.json)}`);
  const token = login.json.access_token;
  if (!token) fail("sem access_token");

  const customers = await request("GET", "/v1/customers?limit=1", { token });
  if (customers.status !== 200) fail(`list customers ${customers.status}`);
  const customerId = customers.json.items?.[0]?.id;
  if (!customerId) {
    fail("nenhum tomador cadastrado — rode npm run db:seed ou crie via API");
  }

  const idempotencyKey = process.env.IDEMPOTENCY_KEY ?? `uat-17-${Date.now()}`;
  const create = await request("POST", "/v1/charges", {
    token,
    body: {
      idempotency_key: idempotencyKey,
      customer_id: customerId,
      amount_cents: Number(process.env.AMOUNT_CENTS ?? 250000),
      due_date: process.env.DUE_DATE ?? "2026-12-15",
      description: "UAT-17 homolog QA",
    },
  });

  console.log("Resposta POST /v1/charges:");
  console.log(JSON.stringify(create.json, null, 2));

  if (create.status !== 201) fail(`criar cobrança retornou ${create.status}`);
  if (create.json.status !== "registered") {
    fail(
      `status esperado 'registered', recebido '${create.json.status}'. TI: confira GATEWAY_MOCK=true e GATEWAY_SYNC_PROCESSING=true`,
    );
  }
  if (!create.json.gateway_ref) fail("gateway_ref vazio");

  console.log("\nOK — UAT-17");
  console.log(`  charge_id:      ${create.json.id}`);
  console.log(`  status:         ${create.json.status}`);
  console.log(`  gateway_ref:    ${create.json.gateway_ref}`);
  console.log(`  idempotency:    ${idempotencyKey}`);
  const amountCents = Number(process.env.AMOUNT_CENTS ?? 250000);
  mkdirSync(path.dirname(lastChargeFile), { recursive: true });
  writeFileSync(
    lastChargeFile,
    JSON.stringify(
      {
        charge_id: create.json.id,
        gateway_ref: create.json.gateway_ref,
        amount_cents: amountCents,
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log("\nPróximo: UAT-18 no PORTAL (admin) — detalhe da cobrança");
  console.log(`  http://localhost:5173/charges/${create.json.id}`);
  console.log("\nUAT-19 — webhook (escolha UMA opção):");
  console.log("  npm run uat:webhook-paid");
  console.log("  (usa automaticamente a última cobrança em .homolog/last-charge.json)");
  console.log("\nOu PowerShell — as 3 linhas juntas:");
  console.log(`  $env:CHARGE_ID="${create.json.id}"; $env:AMOUNT_CENTS="${amountCents}"; npm run uat:webhook-paid`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
