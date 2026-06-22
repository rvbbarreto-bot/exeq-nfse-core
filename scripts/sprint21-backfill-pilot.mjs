#!/usr/bin/env node
/**
 * Sprint 21 P1 — operação piloto backfill tax_snapshot (piloto-sp).
 *
 * Uso:
 *   npm run sprint21:backfill:dry-run
 *   npm run sprint21:backfill:apply
 *   npm run sprint21:backfill:api-dry-run   # exige API em API_URL
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env" });

const args = process.argv.slice(2);
const mode = args[0] ?? "dry-run";
const apiUrl = process.env.API_URL ?? "http://localhost:3002";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";
const tenantSlug = process.env.BACKFILL_TENANT ?? "piloto-sp";
const days = Number(process.env.BACKFILL_DAYS ?? "90");
const outDir = path.resolve("docs/evidencias");

async function importBackfill() {
  const { runBackfillTaxSnapshots } = await import(
    "../apps/api/src/modules/fiscal/backfill-tax-snapshot.service.ts"
  );
  const { closeDb } = await import("../apps/api/src/db/client.ts");
  return { runBackfillTaxSnapshots, closeDb };
}

async function runCli(dryRun) {
  const { runBackfillTaxSnapshots, closeDb } = await importBackfill();
  const summary = await runBackfillTaxSnapshots({
    days,
    tenantSlug,
    limit: 5000,
    dryRun,
  });
  await closeDb();
  return summary;
}

async function runApi(dryRun) {
  const loginRes = await fetch(`${apiUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login falhou HTTP ${loginRes.status}`);
  }
  const { access_token: token } = await loginRes.json();

  const res = await fetch(`${apiUrl}/v1/fiscal/admin/backfill-snapshots`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ days, dry_run: dryRun }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Backfill API HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body };
}

function writeEvidence(label, cliSummary, apiResult) {
  mkdirSync(outDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(outDir, `SPRINT21_BACKFILL_PILOTO_${day}.md`);
  const lines = [
    `# Sprint 21 P1 — Backfill piloto-sp (${day})`,
    "",
    `**Modo:** ${label}`,
    `**Tenant:** ${tenantSlug}`,
    `**Janela:** ${days} dias`,
    "",
    "## CLI",
    "",
    "```json",
    JSON.stringify(cliSummary, null, 2),
    "```",
    "",
  ];
  if (apiResult) {
    lines.push(
      "## API admin",
      "",
      `HTTP ${apiResult.status}`,
      "",
      "```json",
      JSON.stringify(apiResult.body, null, 2),
      "```",
      "",
    );
  }
  lines.push(
    "## Checklist P1",
    "",
    `- [x] S21-06 dry-run executado`,
    `- [${cliSummary.dry_run ? " " : "x"}] S21-07 backfill aplicado`,
    `- [x] S21-08 evidência registrada`,
    "",
  );
  writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`\nEvidência: ${file}`);
}

async function main() {
  if (mode === "api-dry-run") {
    const apiResult = await runApi(true);
    console.log(JSON.stringify(apiResult.body, null, 2));
    writeEvidence("api-dry-run", apiResult.body, apiResult);
    return;
  }

  if (mode === "apply") {
    const dry = await runCli(true);
    console.log("=== Dry-run (pré-apply) ===");
    console.log(JSON.stringify(dry, null, 2));
    if (dry.errors > 0) {
      console.error("Abortado: dry-run reportou erros.");
      process.exit(1);
    }
    const applied = await runCli(false);
    console.log("\n=== Apply ===");
    console.log(JSON.stringify(applied, null, 2));
    writeEvidence("apply", applied, null);
    process.exit(applied.errors > 0 ? 1 : 0);
  }

  const summary = await runCli(true);
  console.log(JSON.stringify(summary, null, 2));
  writeEvidence("dry-run", summary, null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
