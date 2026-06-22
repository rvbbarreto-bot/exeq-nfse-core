#!/usr/bin/env node
/**
 * Sprint 21 Opção A — gate operacional backfill (homolog / prod).
 *
 * Uso:
 *   npm run sprint21:backfill:homolog-gate
 *   PO_APPLY_AUTHORIZED=true npm run sprint21:backfill:homolog-apply
 *   BACKFILL_ENV=prod PO_APPLY_AUTHORIZED=true npm run sprint21:backfill:homolog-apply
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env" });

const args = process.argv.slice(2);
const mode = args[0] ?? "homolog-gate";
const apiUrl = process.env.API_URL ?? "http://localhost:3002";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";
const tenantSlug = process.env.BACKFILL_TENANT ?? "piloto-sp";
const days = Number(process.env.BACKFILL_DAYS ?? "90");
const envLabel = (process.env.BACKFILL_ENV ?? "homolog").toLowerCase();
const poAuthorized = process.env.PO_APPLY_AUTHORIZED === "true";
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

async function runApiDryRun() {
  const loginRes = await fetch(`${apiUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    return { ok: false, error: `Login HTTP ${loginRes.status}` };
  }
  const { access_token: token } = await loginRes.json();
  const res = await fetch(`${apiUrl}/v1/fiscal/admin/backfill-snapshots`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ days, dry_run: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    return { ok: false, error: `Backfill HTTP ${res.status}`, body };
  }
  return { ok: true, status: res.status, body };
}

function evidencePath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(outDir, `BACKFILL_${envLabel.toUpperCase()}_${day}.md`);
}

function writeEvidence(sections) {
  mkdirSync(outDir, { recursive: true });
  const file = evidencePath();
  writeFileSync(file, sections.join("\n"), "utf8");
  console.log(`\nEvidência: ${file}`);
  return file;
}

function buildEvidence({ phase, dryRun, apply, apiResult, notes }) {
  const day = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Backfill tax_snapshot — ${envLabel} (${day})`,
    "",
    "| Campo | Valor |",
    "|-------|-------|",
    `| **Ambiente** | ${envLabel} |`,
    `| **Tenant** | ${tenantSlug} |`,
    `| **Janela** | ${days} dias |`,
    `| **Fase** | ${phase} |`,
    `| **PO apply autorizado** | ${poAuthorized ? "sim" : "não"} |`,
    "",
  ];

  if (dryRun) {
    lines.push(
      "## G1 — Dry-run CLI",
      "",
      "```json",
      JSON.stringify(dryRun, null, 2),
      "```",
      "",
    );
  }

  if (apiResult?.ok) {
    lines.push(
      "## Dry-run API",
      "",
      `HTTP ${apiResult.status}`,
      "",
      "```json",
      JSON.stringify(apiResult.body, null, 2),
      "```",
      "",
    );
  } else if (apiResult && !apiResult.ok) {
    lines.push("## Dry-run API", "", `_Indisponível: ${apiResult.error}_`, "");
  }

  if (apply) {
    lines.push(
      "## G3 — Apply",
      "",
      "```json",
      JSON.stringify(apply, null, 2),
      "```",
      "",
    );
  }

  if (notes?.length) {
    lines.push("## Notas", "", ...notes.map((n) => `- ${n}`), "");
  }

  lines.push(
    "## Checklist runbook",
    "",
    `- [${dryRun ? "x" : " "}] G1 dry-run CLI`,
    `- [${apiResult?.ok ? "x" : " "}] Dry-run API`,
    `- [${apply ? "x" : " "}] Apply executado`,
    `- [${apply && apply.candidates === 0 && dryRun?.candidates === 0 ? "x" : apply && dryRun?.candidates > 0 && apply.errors === 0 ? "x" : " "}] Pós-apply validado`,
    "",
  );

  return lines;
}

async function homologGate({ withApply }) {
  const dryRun = await runCli(true);
  console.log("=== G1 Dry-run CLI ===");
  console.log(JSON.stringify(dryRun, null, 2));

  if (dryRun.errors > 0) {
    writeEvidence(
      buildEvidence({
        phase: "abortado (errors > 0)",
        dryRun,
        notes: ["Abortado: investigar erros antes de apply."],
      }),
    );
    process.exit(1);
  }

  let apiResult = null;
  try {
    apiResult = await runApiDryRun();
    if (apiResult.ok) {
      console.log("\n=== Dry-run API ===");
      console.log(JSON.stringify(apiResult.body, null, 2));
    } else {
      console.warn(`\nAPI dry-run skip: ${apiResult.error}`);
    }
  } catch (err) {
    console.warn(`\nAPI dry-run skip: ${err instanceof Error ? err.message : err}`);
  }

  if (dryRun.candidates === 0) {
    writeEvidence(
      buildEvidence({
        phase: "concluído — fila vazia",
        dryRun,
        apiResult,
        notes: [
          "Nenhuma emissão authorized sem snapshot na janela.",
          "Apply não necessário.",
        ],
      }),
    );
    return;
  }

  if (!withApply) {
    writeEvidence(
      buildEvidence({
        phase: "aguardando G3 (PO apply)",
        dryRun,
        apiResult,
        notes: [
          `${dryRun.candidates} candidato(s) — executar apply com PO_APPLY_AUTHORIZED=true`,
          dryRun.candidates > 0 ? "G2: contador deve revisar antes do apply." : "",
        ].filter(Boolean),
      }),
    );
    console.log("\nCandidatos > 0. Para apply: PO_APPLY_AUTHORIZED=true npm run sprint21:backfill:homolog-apply");
    return;
  }

  if (!poAuthorized) {
    console.error("Apply abortado: defina PO_APPLY_AUTHORIZED=true (gate G3/G5).");
    process.exit(1);
  }

  const apply = await runCli(false);
  console.log("\n=== Apply ===");
  console.log(JSON.stringify(apply, null, 2));

  if (apply.errors > 0) {
    writeEvidence(
      buildEvidence({ phase: "apply com erros", dryRun, apply, apiResult }),
    );
    process.exit(1);
  }

  const postDry = await runCli(true);
  console.log("\n=== Pós-apply dry-run ===");
  console.log(JSON.stringify(postDry, null, 2));

  writeEvidence(
    buildEvidence({
      phase: "apply concluído",
      dryRun,
      apply,
      apiResult,
      notes: [
        `Pós-apply candidates: ${postDry.candidates} (esperado 0)`,
        postDry.candidates === 0 ? "Validação OK." : "Revisar issues remanescentes.",
      ],
    }),
  );

  if (postDry.candidates !== 0) {
    process.exit(1);
  }
}

async function main() {
  if (mode === "homolog-apply") {
    await homologGate({ withApply: true });
    return;
  }
  if (mode === "homolog-gate") {
    await homologGate({ withApply: false });
    return;
  }

  console.error(`Modo desconhecido: ${mode}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
