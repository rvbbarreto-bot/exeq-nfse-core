#!/usr/bin/env node
/**
 * US-OP-17-02 — Handoff fábrica → TI (deploy produção piloto 3 municípios).
 * Uso: npm run prod:handoff
 * Com smoke: npm run prod:handoff -- --smoke
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withSmoke = process.argv.includes("--smoke");
const apiUrl = process.env.API_URL ?? "(definir — URL produção)";

console.log("=== Handoff produção — Piloto 3 municípios (Release 2) ===\n");
console.log(`API alvo: ${apiUrl}\n`);

console.log("Pré-requisitos TI (GO_LIVE_PILOTO_CHECKLIST.md § A):");
console.log("  [ ] Postgres + Redis produção");
console.log("  [ ] TLS, secrets (JWT, MASTER_KEY, Focus, gateway, webhook, canal)");
console.log("  [ ] FOCUS_MOCK=false, NF_SYNC_PROCESSING=false");
console.log("  [ ] Catálogo published — 4 municípios (3504107, 3507605, 3528502, 3547809)");
console.log("  [ ] npm run go-live:preflight PASS na release\n");

console.log("Dia D (§ B):");
console.log("  [ ] Backup → npm run db:migrate (MIGRATION_DATABASE_URL) → deploy API/worker/admin");
console.log("  [ ] Confirmar coluna gateway_payment_url: npm run schema:gate:charge (homolog) ou homolog:doctor");
console.log("  [ ] smoke:prod (TI)");
console.log("  [ ] Validação § C (health phase 10, emissão, hypercare, cobrança)\n");

console.log("Pós go-live D+1..D+7 (§ D):");
console.log("  [ ] npm run hypercare:report -- --out docs/evidencias/HYPERCARE_<dia>.md");
console.log("  [ ] (prod) hypercare:report --fail-on-threshold + HYPERCARE_MAX_WEBHOOKS_FAILED=5");
console.log("  [ ] hypercare:export-webhooks -- --out docs/evidencias/webhooks_failed.csv");
console.log("  [ ] Doc operador: docs/OPERACAO_HYPERCARE_DASHBOARD.md");
console.log("  [ ] Gateway HTTP (Sprint 19): GATEWAY_MOCK=false + npm run smoke:gateway-prod");
console.log("  [ ] Runbook: docs/GATEWAY_PROD_ROTACAO.md");
console.log("  [ ] Ata go-live assinada\n");

if (withSmoke) {
  if (!process.env.API_URL) {
    console.error("ERRO: defina API_URL para --smoke\n");
    process.exit(1);
  }
  console.log("--- Executando smoke:prod ---\n");
  const smoke = spawnSync("npm", ["run", "smoke:prod"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (smoke.status !== 0) {
    console.error("\nHANDOFF PRODUÇÃO — smoke:prod FALHOU\n");
    process.exit(1);
  }
  console.log("\nOK — smoke:prod\n");
}

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  HANDOFF PRODUÇÃO — checklist impresso; smoke opcional (--smoke) ║
╠══════════════════════════════════════════════════════════════════╣
║  Docs: docs/GO_LIVE_PILOTO_CHECKLIST.md                          ║
║  Deploy: exeq-nfse-core/docs/DEPLOY_PRODUCAO.md                  ║
║  Runbooks: docs/runbooks/RUNBOOK_INDEX.md                        ║
╚══════════════════════════════════════════════════════════════════╝
`);
