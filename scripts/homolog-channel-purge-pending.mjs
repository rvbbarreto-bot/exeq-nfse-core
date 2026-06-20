#!/usr/bin/env node
/**
 * Homolog — remove notificações pending antigas (telefones de teste / fila acumulada).
 * Uso: npm run homolog:channel:purge-pending
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const base = homologConfig.apiBase;
const tenantSlug = process.env.EXEQ_TENANT_SLUG ?? "piloto-sp";
const channelToken = process.env.EXEQ_CHANNEL_TOKEN ?? "sandbox-channel-token-piloto";
const keepPhone = (process.env.CHANNEL_PURGE_KEEP_PHONE ?? "").replace(/\D/g, "");

function channelHeaders(extra = {}) {
  return {
    "x-tenant-slug": tenantSlug,
    "x-channel-token": channelToken,
    "content-type": "application/json",
    ...extra,
  };
}

async function main() {
  console.log("=== Purge notificações pending (homolog) ===\n");

  const pending = await (
    await fetch(`${base}/v1/channel/notifications/pending?limit=50`, {
      headers: channelHeaders({ "content-type": undefined }),
    })
  ).json();

  const items = pending.items ?? [];
  if (items.length === 0) {
    console.log("Nenhuma notificação pending.\n");
    return;
  }

  console.log(`Encontradas: ${items.length}\n`);

  let acked = 0;
  for (const n of items) {
    const digits = (n.phone_e164 ?? "").replace(/\D/g, "");
    if (keepPhone && digits === keepPhone) {
      console.log(`  manter ${n.id} (${n.phone_e164})`);
      continue;
    }
    const res = await fetch(`${base}/v1/channel/notifications/${n.id}/ack`, {
      method: "POST",
      headers: channelHeaders(),
      body: "{}",
    });
    if (res.status === 204) {
      acked++;
      console.log(`  ack ${n.id} ${n.phone_e164}`);
    } else {
      console.log(`  FALHA ack ${n.id} HTTP ${res.status}`);
    }
  }

  console.log(`\nOK — ${acked} notificação(ões) removida(s) da fila pending`);
  if (keepPhone) {
    console.log(`  Mantido telefone: +${keepPhone}`);
  }
  console.log("\nDica: defina CHANNEL_PURGE_KEEP_PHONE=5511973305448 para preservar o número pareado.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
