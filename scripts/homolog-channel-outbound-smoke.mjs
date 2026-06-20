#!/usr/bin/env node
/**
 * Homolog — simula branch outbound n8n (pending → expand → Evolution → ack).
 * Valida cada etapa e reporta onde o fluxo para.
 *
 * Uso:
 *   npm run homolog:channel:outbound-smoke
 *   npm run homolog:channel:outbound-smoke -- --seed   # cria pending antes (cutover skip ack)
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });
config({ path: path.join(root, ".env.channel"), override: true });

const seed = process.argv.includes("--seed");
const apiBase = homologConfig.apiBase;
const tenantSlug = process.env.EXEQ_TENANT_SLUG ?? "piloto-sp";
const channelToken = process.env.EXEQ_CHANNEL_TOKEN ?? "sandbox-channel-token-piloto";
const evolutionUrl = process.env.EVOLUTION_SERVER_URL ?? "http://localhost:8082";
const evolutionInstance = process.env.EVOLUTION_INSTANCE ?? "exeq-nfse-core";
const evolutionApiKey = process.env.EVOLUTION_API_KEY ?? "homolog-evolution-api-key-nfse";
const customerPhone = (
  process.env.CHANNEL_E2E_PHONE ??
  process.env.CHANNEL_TEST_PHONE ??
  "+5511973857162"
).replace(/\D/g, "");

function channelHeaders(extra = {}) {
  return {
    "x-tenant-slug": tenantSlug,
    "x-channel-token": channelToken,
    "content-type": "application/json",
    ...extra,
  };
}

function fail(step, msg, extra) {
  console.error(`\nFALHA [${step}] ${msg}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

function expandPendingItems(apiResponse) {
  const items = apiResponse?.items;
  if (!Array.isArray(items)) {
    return { ok: false, reason: "resposta sem campo items[]", items: [] };
  }
  if (items.length === 0) {
    return {
      ok: false,
      reason: "fila pending vazia — Split/Expand produz 0 itens e Evolution não executa",
      items: [],
    };
  }
  const valid = items.filter((n) => n?.id && n?.phone_e164 && n?.message_body);
  if (valid.length === 0) {
    return { ok: false, reason: "items sem id/phone_e164/message_body", items };
  }
  return { ok: true, items: valid };
}

async function main() {
  console.log("=== Homolog outbound smoke (paridade n8n V13) ===\n");
  console.log(`API:       ${apiBase}`);
  console.log(`Evolution: ${evolutionUrl} instance=${evolutionInstance}`);
  console.log(`Cliente E2E: +${customerPhone}\n`);

  if (seed) {
    console.log("0/5 — seed pending (cutover skip ack)");
    const r = spawnSync(
      process.execPath,
      ["scripts/homolog-channel-cutover.mjs"],
      {
        cwd: root,
        env: { ...process.env, CHANNEL_CUTOVER_SKIP_ACK: "true" },
        encoding: "utf8",
      },
    );
    if (r.status !== 0) {
      console.error(r.stdout || r.stderr);
      fail("seed", "cutover falhou");
    }
    console.log((r.stdout || "").split("\n").filter((l) => l.trim()).slice(-4).join("\n"));
    console.log("");
  }

  console.log("1/5 — GET /v1/channel/notifications/pending (API Pending Notifications)");
  const pendingRes = await fetch(`${apiBase}/v1/channel/notifications/pending?limit=20`, {
    headers: channelHeaders({ "content-type": undefined }),
  });
  const pendingBody = await pendingRes.json();
  if (!pendingRes.ok) {
    fail("pending", `HTTP ${pendingRes.status}`, pendingBody);
  }
  console.log(`   HTTP ${pendingRes.status} items=${pendingBody.items?.length ?? "?"}`);

  console.log("2/5 — Expand Pending Items (substitui Split Notifications)");
  const expanded = expandPendingItems(pendingBody);
  if (!expanded.ok) {
    console.error(`\n   DIAGNÓSTICO: ${expanded.reason}`);
    console.error("\n   Correções:");
    console.error("   • Rode com --seed para criar notificação pending");
    console.error("   • Ou: CHANNEL_CUTOVER_SKIP_ACK=true npm run homolog:channel:cutover");
    console.error("   • Verifique se n8n já fez ack (fila esvaziou)\n");
    fail("expand", expanded.reason, pendingBody);
  }
  const notif =
    expanded.items.find((n) => n.phone_e164.replace(/\D/g, "") === customerPhone) ??
    expanded.items[0];
  if (!notif) {
    fail("expand", "nenhuma notificação pending válida", { pendingPhones: expanded.items.map((n) => n.phone_e164) });
  }
  console.log(`   ${expanded.items.length} item(ns) — usando id=${notif.id} phone=${notif.phone_e164}`);

  console.log("3/5 — POST Evolution sendText");
  const evoBody = {
    number: notif.phone_e164.replace(/^\+/, ""),
    text: notif.message_body,
  };
  const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
    method: "POST",
    headers: { apikey: evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify(evoBody),
  });
  const evoText = await evoRes.text();
  let evoJson;
  try {
    evoJson = JSON.parse(evoText);
  } catch {
    evoJson = { raw: evoText };
  }
  if (![200, 201].includes(evoRes.status)) {
    fail("evolution", `HTTP ${evoRes.status}`, evoJson);
  }
  console.log(`   HTTP ${evoRes.status} status=${evoJson.status ?? "ok"}`);

  console.log("4/5 — POST ack notification");
  const ackRes = await fetch(`${apiBase}/v1/channel/notifications/${notif.id}/ack`, {
    method: "POST",
    headers: channelHeaders(),
    body: "{}",
  });
  if (ackRes.status !== 204) {
    const ackBody = await ackRes.text();
    fail("ack", `HTTP ${ackRes.status}`, ackBody);
  }
  console.log("   HTTP 204");

  console.log("5/5 — Confirmar fila vazia");
  const after = await (
    await fetch(`${apiBase}/v1/channel/notifications/pending?limit=5`, {
      headers: channelHeaders({ "content-type": undefined }),
    })
  ).json();
  const still = after.items?.filter((n) => n.id === notif.id)?.length ?? 0;
  if (still > 0) {
    fail("verify", "notificação ainda pending após ack");
  }
  console.log(`   pending restante: ${after.items?.length ?? 0}`);

  console.log("\nOK — outbound smoke passou (API → expand → Evolution → ack)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
