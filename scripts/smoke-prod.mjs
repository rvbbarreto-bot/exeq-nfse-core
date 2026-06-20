#!/usr/bin/env node
/**
 * Smoke test pós-deploy produção / staging.
 * Uso: API_URL=... SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/smoke-prod.mjs
 */
const base = process.env.API_URL ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";
const skipEmit = process.env.SMOKE_SKIP_EMIT === "true";

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
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function main() {
  console.log(`Smoke prod → ${base}`);

  const health = await request("GET", "/health");
  if (health.status !== 200) fail(`health ${health.status}`);
  if (health.json.status !== "ok") fail("health status not ok");
  ok(`health phase=${health.json.phase}`);

  const login = await request("POST", "/v1/auth/login", {
    body: { email, password },
  });
  if (login.status !== 200) fail(`login ${login.status}`);
  const token = login.json.access_token;
  if (!token) fail("no access_token");
  ok("login");

  const tax = await request("POST", "/v1/tax/resolve", {
    token,
    body: {
      ibge_code: "3504107",
      service_code: "1.01",
      tax_regime: "simples_nacional",
      competence_date: "2026-06-01",
    },
  });
  if (tax.status !== 200) fail(`tax/resolve ${tax.status}`);
  ok(`tax resolve rule_id=${tax.json.rule_id?.slice(0, 8)}...`);

  if (!skipEmit) {
    const emit = await request("POST", "/v1/nf/issues", {
      token,
      body: {
        idempotency_key: `smoke-prod-${Date.now()}`,
        provider_id: process.env.SMOKE_PROVIDER_ID,
        customer_id: process.env.SMOKE_CUSTOMER_ID,
        service_id: process.env.SMOKE_SERVICE_ID,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 10000,
      },
    });
    if (!process.env.SMOKE_PROVIDER_ID) {
      ok("emit skipped (set SMOKE_PROVIDER_ID/CUSTOMER_ID/SERVICE_ID to test emit)");
    } else if (emit.status !== 202) {
      fail(`emit ${emit.status} ${JSON.stringify(emit.json)}`);
    } else {
      ok(`emit status=${emit.json.status} issue=${emit.json.issue_id?.slice(0, 8)}`);
    }
  }

  console.log("\nSmoke prod completed successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
