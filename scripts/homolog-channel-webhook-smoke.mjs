#!/usr/bin/env node
/**
 * S1-04 — Smoke inbound n8n (simula Evolution MESSAGES_UPSERT → webhook produção).
 * Valida: webhook responde + sessão criada no Core (ops).
 *
 * Uso: npm run homolog:channel:webhook-smoke
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const n8nWebhook = process.env.N8N_WEBHOOK_URL ?? "http://localhost:5680/webhook/exeq-nfse-whatsapp";
const apiBase = homologConfig.apiBase;
const email = homologConfig.email;
const password = homologConfig.password;
const messageId = `smoke-s1-04-${Date.now()}`;
const phone = process.env.CHANNEL_TEST_PHONE ?? "+5511973305448";
const phoneDigits = phone.replace(/\D/g, "");

const evolutionPayload = {
  event: "messages.upsert",
  instance: "exeq-nfse-core",
  data: {
    key: {
      remoteJid: `${phoneDigits}@s.whatsapp.net`,
      fromMe: false,
      id: messageId,
    },
    message: { conversation: "S1-04 smoke inbound" },
  },
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== S1-04 smoke — Evolution → n8n webhook ===\n");
  console.log(`Webhook: ${n8nWebhook}\n`);

  const hookRes = await fetch(n8nWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(evolutionPayload),
  });
  console.log(`POST webhook: ${hookRes.status}`);
  if (hookRes.status === 404) {
    console.error("FALHA — webhook 404 (workflow V13 inativo no n8n?)");
    process.exit(1);
  }
  if (hookRes.status >= 500) {
    const text = await hookRes.text().catch(() => "");
    console.error("FALHA — webhook 5xx:", text.slice(0, 300));
    process.exit(1);
  }

  await sleep(3000);

  const login = await fetch(`${apiBase}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (!loginBody.access_token) {
    console.error("FALHA login admin");
    process.exit(1);
  }
  const adminH = { authorization: `Bearer ${loginBody.access_token}` };

  const sessions = await (
    await fetch(`${apiBase}/v1/ops/channel/sessions?limit=20`, { headers: adminH })
  ).json();

  const match = sessions.items?.find(
    (s) => s.idempotency_key === `wa-${messageId}` || s.phone_e164 === phone,
  );

  if (!match?.id) {
    console.error("FALHA — sessão não encontrada em /v1/ops/channel/sessions");
    console.error("  idempotency_key esperada: wa-" + messageId);
    process.exit(1);
  }

  console.log("\nOK — Inbound n8n validado (P1 parcial automatizado)");
  console.log(`  session_id: ${match.id}`);
  console.log(`  status:     ${match.status}`);
  console.log(`  phone:      ${match.phone_e164}`);
  console.log("\nPróximo PO: mensagem real WhatsApp (P1) + emissão (P2) + retorno WA (P3)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
