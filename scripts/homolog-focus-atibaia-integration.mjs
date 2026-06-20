#!/usr/bin/env node
/**
 * Integração completa: API → Focus Nacional → emissão Atibaia + canal WhatsApp inbound.
 * Uso: npm run homolog:focus-atibaia:integration
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig, homologTestAmountCents, fetchWithRetry, flushBullNfQueues } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const base = process.env.API_URL ?? homologConfig.apiBase;
const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;
const tenantSlug = process.env.EXEQ_TENANT_SLUG ?? "piloto-sp";
const channelToken = process.env.EXEQ_CHANNEL_TOKEN ?? "sandbox-channel-token-piloto";
const phone = process.env.CHANNEL_TEST_PHONE ?? "+5511973305448";
const IBGE = "3504107";

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
  console.log("=== Integração Focus Nacional Atibaia + Canal WhatsApp ===\n");

  await flushBullNfQueues();
  await sleep(500);

  const health = await (await fetchWithRetry(`${base}/health`)).json();
  console.log(`Health: focus.mock=${health.focus?.mock} routing=${health.atibaia_routing?.provider}`);

  if (health.atibaia_routing?.provider !== "focus_nacional") {
    console.error("FALHA — Atibaia deve rotear focus_nacional");
    process.exit(1);
  }

  console.log("\n1/4 — Canal inbound (simula WhatsApp texto)");
  const inbound1 = await fetchWithRetry(`${base}/v1/channel/inbound`, {
    method: "POST",
    headers: channelHeaders(),
    body: JSON.stringify({
      phone_e164: phone,
      message_id: `int-${Date.now()}`,
      text: `R$ ${(homologTestAmountCents / 100).toFixed(2).replace(".", ",")} serviço: Integração Focus Atibaia`,
    }),
  });
  const in1 = await inbound1.json();
  if (inbound1.status !== 200 || !in1.session_id) {
    console.error("FALHA inbound:", inbound1.status, in1);
    process.exit(1);
  }
  console.log(`   session=${in1.session_id} status=${in1.status}`);
  console.log(`   reply: ${in1.reply_text?.slice(0, 80)}...`);

  console.log("\n2/4 — Confirmar via inbound");
  const inbound2 = await fetchWithRetry(`${base}/v1/channel/inbound`, {
    method: "POST",
    headers: channelHeaders(),
    body: JSON.stringify({
      phone_e164: phone,
      message_id: `int-confirm-${Date.now()}`,
      text: "confirmar",
    }),
  });
  const in2 = await inbound2.json();
  if (inbound2.status !== 200 || !in2.issue_id) {
    console.error("FALHA confirm inbound:", inbound2.status, in2);
    process.exit(1);
  }
  const issueId = in2.issue_id;
  console.log(`   issue_id=${issueId} emitted=${in2.emitted}`);

  const login = await fetchWithRetry(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const { access_token: adminToken } = await login.json();
  const adminH = { authorization: `Bearer ${adminToken}` };

  console.log("\n3/4 — Poll emissão");
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const detail = await (await fetchWithRetry(`${base}/v1/nf/issues/${issueId}`, { headers: adminH })).json();
    console.log(`   poll ${i + 1}: ${detail.status} provider=${detail.events?.[0]?.metadata?.nfse_provider_kind ?? "?"}`);
    if (["authorized", "rejected", "failed", "cancelled"].includes(detail.status)) {
      if (detail.status !== "authorized") {
        const err = detail.events?.find((e) => e.to_status === detail.status)?.metadata?.error;
        console.error("FALHA emissão:", detail.status, err ?? "");
        process.exit(1);
      }
      console.log(`   focus_ref=${detail.focus_ref ?? "(mock)"}`);
      break;
    }
    if (i === 39) {
      console.error("FALHA — timeout poll");
      process.exit(1);
    }
  }

  console.log("\n4/4 — Notification WhatsApp");
  await sleep(2000);
  const pending = await (
    await fetchWithRetry(`${base}/v1/channel/notifications/pending`, { headers: channelHeaders() })
  ).json();
  const notif = pending.items?.find((n) => n.nf_issue_id === issueId);
  if (!notif) {
    console.error("FALHA — sem notification");
    process.exit(1);
  }
  console.log(`   event=${notif.event_type} phone=${notif.phone_e164}`);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  INTEGRAÇÃO OK — Focus Nacional Atibaia + WhatsApp       ║
║  issue_id: ${issueId}  ║
║  Disponível para validação QA                            ║
╚══════════════════════════════════════════════════════════╝
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
