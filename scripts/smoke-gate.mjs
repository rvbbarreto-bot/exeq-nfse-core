#!/usr/bin/env node
/**
 * Gate smoke — obrigatório antes de avisar PO (US-OP-07).
 * Uso: API_URL=... SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/smoke-gate.mjs
 */
const base = process.env.API_URL ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";

async function request(method, path, { token, body, accept } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (accept) headers.accept = accept;

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
  return { status: res.status, json, text, contentType: res.headers.get("content-type") };
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function main() {
  console.log(`Smoke gate → ${base}`);

  const health = await request("GET", "/health");
  if (health.status !== 200) fail(`health ${health.status}`);
  if (health.json.status !== "ok") fail("health status not ok");
  ok(`health phase=${health.json.phase}`);

  const login = await request("POST", "/v1/auth/login", {
    body: { email, password },
  });
  if (login.status !== 200) fail(`login ${login.status} ${JSON.stringify(login.json)}`);
  const token = login.json.access_token;
  if (!token) fail("no access_token");
  ok("login");

  const issues = await request("GET", "/v1/nf/issues?limit=5", { token });
  if (issues.status !== 200) fail(`list issues ${issues.status}`);
  if (!Array.isArray(issues.json.items)) fail("issues items missing");
  ok(`list issues count=${issues.json.items.length}`);

  const charges = await request("GET", "/v1/charges?limit=5", { token });
  if (charges.status !== 200) fail(`list charges ${charges.status}`);
  ok(`list charges count=${charges.json.items?.length ?? 0}`);

  if (process.env.GATEWAY_MOCK === "true" && process.env.GATEWAY_SYNC_PROCESSING === "true") {
    const customers = await request("GET", "/v1/customers?limit=1", { token });
    if (customers.status !== 200) fail(`list customers ${customers.status}`);
    const customerId = customers.json.items?.[0]?.id;
    if (!customerId) fail("no customer for gateway smoke");
    const createCharge = await request("POST", "/v1/charges", {
      token,
      body: {
        idempotency_key: `smoke-gw-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 100,
        due_date: "2026-12-31",
        description: "smoke gate gateway",
      },
    });
    if (createCharge.status !== 201) fail(`create charge gateway ${createCharge.status}`);
    if (!createCharge.json.gateway_ref) fail("gateway_ref missing after create");
    ok(`gateway charge ref=${createCharge.json.gateway_ref}`);
  } else {
    ok("gateway smoke skipped (GATEWAY_MOCK/SYNC not set)");
  }

  const summary = await request("GET", "/v1/ops/summary", { token });
  if (summary.status !== 200) fail(`ops summary ${summary.status}`);
  if (!summary.json.alerts || !summary.json.issue_stats) fail("ops summary shape invalid");
  ok(
    `ops summary alerts failed_issues=${summary.json.alerts.issues_failed} total_issues=${summary.json.issue_stats.total}`,
  );

  const alerts = await request("GET", "/v1/ops/alerts", { token });
  if (alerts.status !== 200) fail(`ops alerts ${alerts.status}`);
  ok("ops alerts (legacy)");

  const exportIssues = await request("GET", "/v1/nf/issues/export?limit=5", {
    token,
    accept: "text/csv",
  });
  if (exportIssues.status !== 200) fail(`export issues ${exportIssues.status}`);
  if (!exportIssues.text.includes("id,status")) fail("export issues CSV header missing");
  ok("export issues CSV");

  const exportCharges = await request("GET", "/v1/charges/export?limit=5", { token });
  if (exportCharges.status !== 200) fail(`export charges ${exportCharges.status}`);
  if (!exportCharges.text.includes("id,status")) fail("export charges CSV header missing");
  ok("export charges CSV");

  const exportWebhooks = await request("GET", "/v1/webhooks/inbox/export?limit=5", { token });
  if (exportWebhooks.status !== 200) fail(`export webhooks ${exportWebhooks.status}`);
  if (!exportWebhooks.text.includes("id,status")) fail("export webhooks CSV header missing");
  ok("export webhooks CSV");

  const firstIssue = issues.json.items?.[0];
  if (firstIssue?.id) {
    const exportEvents = await request("GET", `/v1/nf/issues/${firstIssue.id}/events/export`, {
      token,
    });
    if (exportEvents.status !== 200) fail(`export issue events ${exportEvents.status}`);
    const eventsCsv = exportEvents.text.replace(/^\uFEFF/, "");
    if (!eventsCsv.includes("event_id,from_status,to_status")) fail("export events CSV header missing");
    ok("export issue events CSV");
    const detail = await request("GET", `/v1/nf/issues/${firstIssue.id}`, { token });
    const correlationId = detail.json?.correlation_id;
    if (correlationId) {
      const byCorr = await request(
        "GET",
        `/v1/nf/issues?limit=5&correlation_id=${correlationId}`,
        { token },
      );
      if (byCorr.status !== 200) fail(`filter correlation_id ${byCorr.status}`);
      ok(`filter correlation_id count=${byCorr.json.items?.length ?? 0}`);
    }
  } else {
    ok("export events skipped (no issues in seed)");
  }

  console.log("\nSmoke gate completed successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
