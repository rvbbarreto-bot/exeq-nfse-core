#!/usr/bin/env node
/**
 * Homolog cutover canal WhatsApp V13 — simula n8n (sem Evolution).
 * Valida: sessão → draft → confirm → emissão → notification pending → ack
 *
 * Uso: npm run homolog:channel:cutover
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig, fetchWithRetry, homologTestAmountCents, flushBullNfQueues } from "./homolog-utils.mjs";
import { isHomologEmissionGateReady, ATIBAIA_IBGE } from "../packages/shared/dist/homolog-emission-gate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const tenantSlug = process.env.EXEQ_TENANT_SLUG ?? "piloto-sp";
const channelToken = process.env.EXEQ_CHANNEL_TOKEN ?? "sandbox-channel-token-piloto";
const IBGE = ATIBAIA_IBGE;
const phone = process.env.CHANNEL_E2E_PHONE ?? process.env.CHANNEL_TEST_PHONE ?? "+5511973857162";
const skipAck = process.env.CHANNEL_CUTOVER_SKIP_ACK === "true";

function channelHeaders(extra = {}) {
  return {
    "x-tenant-slug": tenantSlug,
    "x-channel-token": channelToken,
    "content-type": "application/json",
    ...extra,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== Homolog cutover canal WhatsApp V14 (Core API) ===\n");
  console.log(`API: ${base} | tenant: ${tenantSlug}\n`);

  await flushBullNfQueues();
  await sleep(500);

  const purge = spawnSync("node", ["scripts/homolog-channel-purge-pending.mjs"], {
    cwd: root,
    stdio: "ignore",
    shell: true,
  });

  let health = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetchWithRetry(`${base}/health`);
      health = await res.json();
    } catch {
      health = null;
    }
    if (health?.status) break;
    if (attempt < 5) await sleep(2000);
  }
  if (!health?.status) {
    console.error("FALHA — API /health indisponível. Rode: npm run homolog:ready-for-qa");
    process.exit(1);
  }
  const gate = isHomologEmissionGateReady(health);
  if (!gate.ok) {
    console.error(
      "FALHA pré-requisito — emissão homolog não configurada.\n" +
        `  ${gate.message}\n` +
        "  Focus: FOCUS_MOCK=true no .env.local\n" +
        "  Atibaia: focus_nacional (Betha descartado)\n" +
        "  Reinicie API + worker: npm run homolog:ready-for-qa\n" +
        "  Runbook: docs/RUNBOOK_CUTOVER_WHATSAPP_V13.md",
    );
    process.exit(1);
  }
  console.log(`Preflight: homolog gate OK (${gate.mode})\n`);

  const login = await fetchWithRetry(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (login.status !== 200 || !loginBody.access_token) {
    console.error("FALHA login admin:", login.status);
    process.exit(1);
  }
  const adminH = { authorization: `Bearer ${loginBody.access_token}` };

  const providers = await (await fetchWithRetry(`${base}/v1/providers?limit=5`, { headers: adminH })).json();
  const customers = await (await fetchWithRetry(`${base}/v1/customers?limit=5`, { headers: adminH })).json();
  const services = await (await fetchWithRetry(`${base}/v1/services?limit=5`, { headers: adminH })).json();
  const provider = providers.items?.[0];
  const customer = customers.items?.[0];
  const service = services.items?.find((s) => s.service_code === "1.01") ?? services.items?.[0];

  if (!provider?.id || !customer?.id || !service?.id) {
    console.error("FALHA master data — npm run homolog:focus:ensure-data");
    process.exit(1);
  }

  const idem = `cutover-v13-${Date.now()}`;

  console.log(`Telefone sessão: ${phone}${skipAck ? " (skip ack — n8n envia)" : ""}\n`);

  console.log("1/5 — POST /v1/channel/sessions");
  const create = await fetchWithRetry(`${base}/v1/channel/sessions`, {
    method: "POST",
    headers: channelHeaders(),
    body: JSON.stringify({ phone_e164: phone, idempotency_key: idem }),
  });
  const createBody = await create.json();
  if (![201, 409].includes(create.status)) {
    console.error("FALHA create session:", create.status, createBody);
    process.exit(1);
  }
  const sessionId = createBody.session_id;
  console.log(`   session_id=${sessionId} status=${createBody.status}`);

  console.log("2/5 — PATCH draft (paridade n8n Collect Draft)");
  const draft = {
    provider_id: provider.id,
    customer_id: customer.id,
    service_id: service.id,
    ibge_code: IBGE,
    competence_date: "2026-06-01",
    amount_cents: homologTestAmountCents,
    description: "Homolog cutover canal V13",
  };
  const patch = await fetchWithRetry(`${base}/v1/channel/sessions/${sessionId}`, {
    method: "PATCH",
    headers: channelHeaders(),
    body: JSON.stringify(draft),
  });
  const patchBody = await patch.json();
  if (patch.status !== 200 || patchBody.status !== "ready_to_confirm") {
    console.error("FALHA patch draft:", patch.status, patchBody);
    process.exit(1);
  }
  console.log(`   status=${patchBody.status} missing=${patchBody.missing_fields?.length ?? 0}`);

  console.log("3/5 — POST confirm (emissão síncrona API / Focus mock)");
  const confirm = await fetchWithRetry(`${base}/v1/channel/sessions/${sessionId}/confirm`, {
    method: "POST",
    headers: channelHeaders(),
    body: "{}",
  });
  const confirmBody = await confirm.json();
  if (![200, 202].includes(confirm.status) || !confirmBody.issue_id) {
    console.error("FALHA confirm:", confirm.status, confirmBody);
    process.exit(1);
  }
  const issueId = confirmBody.issue_id;
  console.log(`   issue_id=${issueId} status=${confirmBody.status}`);

  let terminal = confirmBody.status === "authorized";
  if (terminal) {
    console.log("4/5 — Emissão síncrona já autorizada (NF_SYNC_PROCESSING)");
  } else {
    console.log("4/5 — Poll issue até terminal (worker)");
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const detail = await (await fetchWithRetry(`${base}/v1/nf/issues/${issueId}`, { headers: adminH })).json();
      console.log(`   poll ${i + 1}: ${detail.status}`);
      if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
        terminal = true;
        if (detail.status !== "authorized") {
          const errEvt = detail.events?.find((e) => e.to_status === "failed");
          const errMsg = errEvt?.metadata?.error ?? detail.status;
          console.error("FALHA — emissão não autorizada:", errMsg);
          process.exit(1);
        }
        break;
      }
    }
  }
  if (!terminal) {
    console.error("FALHA — timeout (worker rodando?)");
    process.exit(1);
  }

  console.log("5/5 — Poll notification + ack (simula n8n outbound)");
  await sleep(2000);
  const pending = await (
    await fetchWithRetry(`${base}/v1/channel/notifications/pending?limit=10`, {
      headers: channelHeaders({ "content-type": undefined }),
    })
  ).json();
  const notif = pending.items?.find((n) => n.nf_issue_id === issueId);
  if (!notif?.id) {
    console.error("FALHA — sem notification pending para issue", issueId);
    if (pending.items?.length) {
      console.error(`  (${pending.items.length} outra(s) pending na fila — rode homolog:channel:purge-pending)`);
    }
    process.exit(1);
  }
  console.log(`   notification id=${notif.id} event=${notif.event_type} phone=${notif.phone_e164}`);

  if (skipAck) {
    console.log("\nOK — Cutover canal V13 (Core API) validado — notification PENDING para n8n");
    console.log(`  session: ${sessionId}`);
    console.log(`  issue:   ${issueId}`);
    console.log(`  notif:   ${notif.id} (aguardando n8n poll)`);
    console.log("\nPróximo: aguarde poll n8n (~1 min) ou execute branch Poll Notifications\n");
    return;
  }

  const ack = await fetchWithRetry(`${base}/v1/channel/notifications/${notif.id}/ack`, {
    method: "POST",
    headers: channelHeaders(),
    body: "{}",
  });
  if (ack.status !== 204) {
    console.error("FALHA ack:", ack.status);
    process.exit(1);
  }

  console.log("\nOK — Cutover canal V13 (Core API) validado");
  console.log(`  session: ${sessionId}`);
  console.log(`  issue:   ${issueId}`);
  console.log(`  notif:   ${notif.id} (acked)`);
  console.log("\nPróximo: npm run channel:import-workflow (V14) e desativar V9–V12");
  console.log("Runbook: docs/RUNBOOK_CUTOVER_WHATSAPP_V13.md\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
