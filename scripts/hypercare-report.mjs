#!/usr/bin/env node
/**
 * Relatório diário hypercare (Sprint 17/20).
 * Uso: API_URL=... npm run hypercare:report
 * Arquivo: npm run hypercare:report -- --out ../docs/evidencias/HYPERCARE_2026-05-25.md
 * Alerta S1: --fail-on-alert (exit 1 se issues_failed > 0 ou webhooks_failed > 0)
 * Threshold prod: --fail-on-threshold + HYPERCARE_MAX_WEBHOOKS_FAILED (default 999 em dev)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const base = process.env.API_URL ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";
const day = process.env.HYPERCARE_DAY ?? new Date().toISOString().slice(0, 10);

const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
const failOnAlert = process.argv.includes("--fail-on-alert");
const failOnThreshold = process.argv.includes("--fail-on-threshold");
const maxWebhooksFailed = Number(process.env.HYPERCARE_MAX_WEBHOOKS_FAILED ?? "999");

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

function mdTable(rows) {
  if (!rows.length) return "_Sem registros._\n";
  const headers = Object.keys(rows[0]);
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${headers.map((h) => String(r[h] ?? "")).join(" | ")} |`),
  ];
  return lines.join("\n") + "\n";
}

async function buildReport() {
  const login = await request("POST", "/v1/auth/login", {
    body: { email, password },
  });
  if (login.status !== 200) {
    throw new Error(`Login falhou ${login.status}`);
  }
  const token = login.json.access_token;

  const health = await request("GET", "/health");
  const opsAlerts = await request("GET", "/v1/ops/alerts", { token });
  const issueStats = await request("GET", "/v1/nf/issues/stats", { token });
  const chargeStats = await request("GET", "/v1/charges/stats", { token });
  const failedIssues = await request("GET", "/v1/nf/issues?status=failed&limit=20", { token });
  const rejectedIssues = await request("GET", "/v1/nf/issues?status=rejected&limit=20", { token });

  const byStatus = issueStats.json?.by_status ?? {};
  const statusRows = Object.entries(byStatus).map(([status, count]) => ({ status, count }));
  const alerts = opsAlerts.json ?? {};
  const cs = chargeStats.json ?? {};
  const failed = failedIssues.json?.items ?? [];
  const rejected = rejectedIssues.json?.items ?? [];

  const lines = [
    `# Hypercare — ${day}`,
    "",
    `**API:** ${base}`,
    "",
    "## Saúde",
    "",
    `- HTTP /health: **${health.status}** — phase \`${health.json?.phase ?? "?"}\``,
    "",
    "## Alertas hypercare (dashboard)",
    "",
    `- Emissões failed: **${alerts.issues_failed ?? "?"}**`,
    `- Emissões na fila: **${alerts.issues_queued ?? "?"}**`,
    `- Webhooks failed: **${alerts.webhooks_failed ?? "?"}**`,
    `- Cobranças pending: **${alerts.charges_pending ?? "?"}**`,
    `- Cobranças registered: **${alerts.charges_registered ?? "?"}**`,
    "",
    "## Emissões (agregado)",
    "",
    `- Total: **${issueStats.json?.total ?? "?"}**`,
    `- Autorizadas: **${byStatus.authorized ?? 0}**`,
    `- Falhas: **${byStatus.failed ?? 0}**`,
    `- Rejeitadas: **${byStatus.rejected ?? 0}**`,
    "",
    mdTable(statusRows),
    "## Cobranças (7 dias)",
    "",
    `- Pendentes: **${cs.pending ?? "?"}**`,
    `- Pagas (7d): **${cs.paid_last_7_days ?? "?"}**`,
    `- Falhas/canceladas (7d): **${cs.failed_last_7_days ?? "?"}**`,
    "",
    "## Emissões failed (amostra)",
    "",
    mdTable(
      failed.map((i) => ({
        id: i.id?.slice(0, 8) + "…",
        ibge: i.ibge_code,
        created_at: i.created_at,
      })),
    ),
    "## Emissões rejected (amostra)",
    "",
    mdTable(
      rejected.map((i) => ({
        id: i.id?.slice(0, 8) + "…",
        ibge: i.ibge_code,
        created_at: i.created_at,
      })),
    ),
    "## Ações (preencher)",
    "",
    "- [ ] Filas Redis (`nf-emission`, `nf-polling`, `webhook-inbox`) — ver runbook",
    "- [ ] DLQ / reprocess conforme runbooks/RUNBOOK_DLQ_REPROCESS.md",
    "- [ ] Incidentes S1/S2 abertos: _nenhum / listar_",
    "",
    "---",
    "_Relatório gerado por `npm run hypercare:report` (Sprint 17/20)._",
    "",
  ];

  return { markdown: lines.join("\n"), alerts };
}

async function main() {
  const { markdown, alerts } = await buildReport();

  if (outPath) {
    const resolved = path.resolve(process.cwd(), outPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, markdown, "utf-8");
    console.log(`Relatório gravado: ${resolved}`);
  } else {
    console.log(markdown);
  }

  if (failOnAlert) {
    const issuesFailed = Number(alerts.issues_failed ?? 0);
    const webhooksFailed = Number(alerts.webhooks_failed ?? 0);
    if (issuesFailed > 0 || webhooksFailed > 0) {
      console.error(
        `\nHYPERCARE ALERTA: issues_failed=${issuesFailed} webhooks_failed=${webhooksFailed}\n`,
      );
      process.exit(1);
    }
  }

  if (failOnThreshold) {
    const webhooksFailed = Number(alerts.webhooks_failed ?? 0);
    if (webhooksFailed > maxWebhooksFailed) {
      console.error(
        `\nHYPERCARE THRESHOLD: webhooks_failed=${webhooksFailed} > max=${maxWebhooksFailed} (HYPERCARE_MAX_WEBHOOKS_FAILED)\n`,
      );
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
