#!/usr/bin/env node
/**
 * Sprint 9 — homolog E2E portal (Playwright).
 * Pré-requisito: API + admin rodando (npm run homolog ou homolog:apps).
 * Uso: npm run homolog:e2e
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig, fetchExeqHealth, fetchAdmin } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`\nFALHA homolog:e2e — ${msg}`);
  console.error("Corrija com: npm run homolog:doctor -- --fix && npm run homolog:apps");
  process.exit(1);
}

async function preflight() {
  console.log("=== Homolog E2E portal — Exeq NFS-e (Sprint 9) ===\n");
  console.log(`API:   ${homologConfig.apiBase}`);
  console.log(`Admin: ${homologConfig.adminBase}\n`);

  const health = await fetchExeqHealth();
  if (!health.ok) {
    fail(
      health.json?.service
        ? `API errada na porta ${homologConfig.apiPort} (${health.json.service})`
        : `API indisponível (${health.error ?? health.status})`,
    );
  }
  console.log(`OK   API /health — phase=${health.json.phase}`);

  const admin = await fetchAdmin();
  if (!admin.ok) fail(`Admin indisponível (${admin.error ?? admin.status})`);
  console.log(`OK   Admin HTML — HTTP ${admin.status}\n`);
}

function runPlaywright() {
  const env = {
    ...process.env,
    API_URL: homologConfig.apiBase,
    ADMIN_E2E_BASE_URL: homologConfig.adminBase,
    SMOKE_EMAIL: homologConfig.email,
    SMOKE_PASSWORD: homologConfig.password,
  };

  const result = spawnSync(
    "npx",
    ["playwright", "test", "--config=playwright.config.ts"],
    { cwd: root, env, stdio: "inherit", shell: true },
  );

  if (result.status !== 0) {
    fail("testes Playwright falharam (veja log acima)");
  }

  console.log("\n=== Resultado ===");
  console.log("HOMOLOG E2E PORTAL: OK — UAT-P0-01..08 (Sprint 9/9b/12)");
  console.log("Relatório HTML: exeq-nfse-core/e2e-report/index.html");
  console.log(
    "\nPrints PO (UAT-18..22) opcionais — gate automatizado cobre DoD portal §4.2.",
  );
}

await preflight();
runPlaywright();
