#!/usr/bin/env node
/**
 * Smoke do branch Poll Notifications do workflow n8n V15.
 * Valida GET pending + normalização (paridade com nós Code do workflow).
 *
 * Uso:
 *   npm run homolog:n8n:poll
 *   npm run homolog:n8n:poll -- --seed   # cria pending via cutover antes
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
const evolutionLine = (process.env.CHANNEL_PAIRED_PHONE ?? "+5511973305448").replace(/\D/g, "");

function channelHeaders(extra = {}) {
  return {
    "x-tenant-slug": tenantSlug,
    "x-channel-token": channelToken,
    ...extra,
  };
}

function fail(step, msg, extra) {
  console.error(`\nFALHA [${step}] ${msg}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

/** Paridade com nó Normalizar Pending API (V15) — entrega todos os pending válidos. */
function normalizePending(raw) {
  const statusCode = Number(raw.statusCode ?? raw.status ?? 200);
  const apiError = raw.error ? String(raw.error) : null;
  const body = raw.body && typeof raw.body === "object" ? raw.body : raw;
  const items = Array.isArray(body.items) ? body.items : [];
  const filtered = items.filter((i) => i?.id && i?.phone_e164 && i?.message_body);
  const apiOk = statusCode >= 200 && statusCode < 300 && !apiError;
  return {
    api_ok: apiOk,
    status_code: statusCode,
    api_url: raw.api_url ?? null,
    api_error: apiError,
    pending_total: items.length,
    pending_filtered: filtered.length,
    has_pending: filtered.length > 0,
    items: filtered,
  };
}

async function fetchPendingFromHost() {
  const url = `${apiBase}/v1/channel/notifications/pending?limit=20`;
  const res = await fetch(url, { headers: channelHeaders() });
  const body = await res.json();
  return {
    statusCode: res.status,
    body,
    api_url: url,
  };
}

async function fetchPendingFromN8nContainer() {
  const script = `
const base = process.env.EXEQ_API_BASE_URL || 'http://host.docker.internal:3002';
const url = base.replace(/\\/$/, '') + '/v1/channel/notifications/pending?limit=20';
fetch(url, {
  headers: {
    'x-tenant-slug': process.env.EXEQ_TENANT_SLUG || 'piloto-sp',
    'x-channel-token': process.env.EXEQ_CHANNEL_TOKEN || 'sandbox-channel-token-piloto',
  },
})
  .then(async (r) => ({ statusCode: r.status, body: await r.json(), api_url: url }))
  .then((j) => console.log(JSON.stringify(j)))
  .catch((e) => console.log(JSON.stringify({ statusCode: 0, error: String(e.message || e), body: { items: [] }, api_url: url })));
`;
  const r = spawnSync("docker", ["exec", "nfse-n8n", "node", "-e", script], {
    encoding: "utf8",
    shell: false,
  });
  if (r.status !== 0) {
    fail("docker-n8n", "container nfse-n8n indisponível — npm run channel:up", { stderr: r.stderr });
  }
  const line = (r.stdout || "").trim().split("\n").pop();
  try {
    return JSON.parse(line);
  } catch {
    fail("docker-n8n", "resposta inválida do container n8n", { stdout: r.stdout, stderr: r.stderr });
  }
}

async function main() {
  console.log("=== Smoke n8n Poll — API Pending Notifications (V15) ===\n");
  console.log(`API host:  ${apiBase}`);
  console.log(`Linha Exeq: +${evolutionLine}\n`);

  if (seed) {
    console.log("0/4 — seed pending (cutover skip ack)");
    const r = spawnSync(process.execPath, ["scripts/homolog-channel-cutover.mjs"], {
      cwd: root,
      env: { ...process.env, CHANNEL_CUTOVER_SKIP_ACK: "true" },
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(r.stdout || r.stderr);
      fail("seed", "cutover falhou");
    }
    console.log("   pending criado via cutover\n");
  }

  console.log("1/4 — GET pending (host → API Core)");
  const hostRaw = await fetchPendingFromHost();
  const hostNorm = normalizePending(hostRaw);
  if (!hostNorm.api_ok) {
    fail("pending-host", "API pending falhou no host", hostNorm);
  }
  console.log(
    `   HTTP ${hostNorm.status_code} total=${hostNorm.pending_total} filtrado=${hostNorm.pending_filtered}`,
  );

  console.log("2/4 — GET pending (container n8n → host.docker.internal:3002)");
  const n8nRaw = await fetchPendingFromN8nContainer();
  const n8nNorm = normalizePending(n8nRaw);
  if (!n8nNorm.api_ok) {
    fail("pending-n8n", "API pending falhou dentro do container n8n", n8nNorm);
  }
  console.log(
    `   HTTP ${n8nNorm.status_code} url=${n8nNorm.api_url} total=${n8nNorm.pending_total} filtrado=${n8nNorm.pending_filtered}`,
  );

  console.log("3/4 — Paridade host vs n8n");
  if (hostNorm.pending_total !== n8nNorm.pending_total) {
    fail("parity", "contagens divergentes host vs n8n", { host: hostNorm.pending_total, n8n: n8nNorm.pending_total });
  }
  console.log("   OK — mesma resposta da API");

  console.log("4/4 — Branch Tem Pending?");
  if (hostNorm.has_pending) {
    const notif = hostNorm.items[0];
    console.log(`   has_pending=true → Expand → Evolution → ack (id=${notif.id})`);
  } else {
    console.log("   has_pending=false → Sem Pending (Normal) — encerra sem erro");
    console.log("   (Normal durante coleta de dados ou antes de authorized/rejected)");
    if (seed) {
      fail(
        "pending-after-seed",
        "seed rodou mas fila ainda vazia — verifique emissão síncrona / notification service",
        hostNorm,
      );
    }
  }

  console.log("\nOK — Poll branch n8n validado (API Pending + Normalizar)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
