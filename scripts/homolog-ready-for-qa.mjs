#!/usr/bin/env node
/**
 * Fábrica — prepara ambiente homolog completo para validação PO/QA.
 * Executa infra, migrate/seed, API, admin, worker, smoke e imprime handoff.
 *
 * Uso (fábrica, com autorização PO):
 *   npm run homolog:ready-for-qa
 *
 * PO/QA só valida após ver: "AMBIENTE PRONTO PARA VALIDAÇÃO PO/QA"
 */
import { config as loadEnv } from "dotenv";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homologConfig, fetchExeqHealth, fetchAdmin, killPortListeners, dockerComposeUp, killEmissionWorkers, flushBullNfQueues } from "./homolog-utils.mjs";

const root = homologConfig.root;
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, ".env.local"), override: true });
loadEnv({ path: path.join(root, ".env.channel"), override: true });

const prodFocusProfile =
  process.env.EXEQ_FOCUS_PROFILE === "production" ||
  String(process.env.FOCUS_BASE_URL ?? "").includes("api.focusnfe.com.br");

const qaEnv = {
  ...process.env,
  GATEWAY_SYNC_PROCESSING: "true",
  GATEWAY_MOCK: process.env.GATEWAY_MOCK ?? "true",
  EVOLUTION_SERVER_URL:
    process.env.EVOLUTION_SERVER_URL ?? process.env.EVOLUTION_API_URL ?? "http://localhost:8082",
  CHANNEL_DEBOUNCE_SECONDS: process.env.CHANNEL_DEBOUNCE_SECONDS ?? "40",
  ...(prodFocusProfile
    ? {
        EXEQ_FOCUS_PROFILE: "production",
        FOCUS_BASE_URL: process.env.FOCUS_BASE_URL ?? "https://api.focusnfe.com.br",
        FOCUS_MOCK: "false",
        FOCUS_HOMOLOG_MOCK: "false",
        NF_SYNC_PROCESSING: process.env.NF_SYNC_PROCESSING ?? "true",
      }
    : {
        FOCUS_MOCK: "true",
        FOCUS_HOMOLOG_MOCK: "true",
        NF_SYNC_PROCESSING: "true",
      }),
};

function log(msg) {
  console.log(msg);
}

function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: qaEnv,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} → exit ${r.status}`);
  }
}

function startDetached(npmScript, logName, npmArgs = []) {
  const logDir = path.join(root, ".homolog");
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, logName);
  const child = spawn("npm", ["run", npmScript, ...npmArgs], {
    cwd: root,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
    env: qaEnv,
  });
  const chunks = [];
  child.stdout?.on("data", (d) => chunks.push(d));
  child.stderr?.on("data", (d) => chunks.push(d));
  child.unref();
  setTimeout(() => {
    try {
      writeFileSync(logFile, Buffer.concat(chunks));
    } catch {
      /* ignore */
    }
  }, 12000);
  return { pid: child.pid, logFile };
}

async function waitServices(maxAttempts = 45, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const h = await fetchExeqHealth();
    const a = await fetchAdmin();
    if (h.ok && a.ok) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function printHandoff(smokeOk) {
  const status = smokeOk ? "PRONTO PARA VALIDAÇÃO PO/QA" : "PARCIAL — ver falhas smoke acima";
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  AMBIENTE ${status.padEnd(52)}║
╠══════════════════════════════════════════════════════════════════╣
║  Acordo: fábrica executou prepare; PO/QA valida funcionalmente   ║
╠══════════════════════════════════════════════════════════════════╣
║  Portal:  ${homologConfig.adminBase.padEnd(54)}║
║  API:     ${homologConfig.apiBase.padEnd(54)}║
║  n8n:     http://localhost:5680 (npm run channel:up)            ║
║  Evolution: http://localhost:8082                             ║
║  Health:  ${`${homologConfig.apiBase}/health`.padEnd(54)}║
║  Login:   ${homologConfig.email.padEnd(54)}║
║  Senha:   ${homologConfig.password.padEnd(54)}║
╠══════════════════════════════════════════════════════════════════╣
║  Logs:    .homolog/api.log | admin.log | worker.log              ║
║  Status:  npm run homolog:status                                 ║
║  Smoke:   npm run homolog:smoke                                  ║
║  Cutover: npm run homolog:channel:cutover                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Evidência PO: anexe saída deste comando + prints do portal        ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

function checkFocusProdToken() {
  if (!prodFocusProfile) return { ok: true };
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(root, "scripts/check-focus-prod-token.mjs")],
    { cwd: root, env: qaEnv, encoding: "utf8" },
  );
  const line = (r.stdout ?? "").trim().split("\n").filter(Boolean).pop();
  try {
    return JSON.parse(line);
  } catch {
    return {
      ok: false,
      message: `check-focus-prod-token falhou (exit ${r.status}): ${(r.stderr ?? r.stdout ?? "").slice(0, 200)}`,
    };
  }
}

async function main() {
  log("=== Fábrica — preparação ambiente PO/QA ===\n");
  log(`Repositório: ${root}`);
  log(`API :${homologConfig.apiPort} | Admin :${homologConfig.adminPort}`);
  log(
    prodFocusProfile
      ? "Focus: PRODUÇÃO api.focusnfe.com.br (mock off — PO)\n"
      : "Focus: MOCK homolog (sandbox)\n",
  );

  log("1/6 — Liberando portas, workers órfãos e filas BullMQ...");
  killPortListeners(homologConfig.apiPort);
  killPortListeners(homologConfig.adminPort);
  killEmissionWorkers();
  await flushBullNfQueues();
  await new Promise((r) => setTimeout(r, 2000));

  log("2/6 — Docker (Postgres + Redis)...");
  dockerComposeUp();
  await new Promise((r) => setTimeout(r, 5000));

  log("3/6 — migrate + seed...");
  runSync("npm", ["run", "db:setup"]);

  log("4/6 — API, Admin e Worker (background)...");
  const api = startDetached("dev", "api.log");
  log(`   API pid ${api.pid} → ${api.logFile}`);
  await new Promise((r) => setTimeout(r, 4000));
  const admin = startDetached("dev:admin", "admin.log");
  log(`   Admin pid ${admin.pid} → ${admin.logFile}`);
  if (qaEnv.NF_SYNC_PROCESSING !== "true") {
    const worker = startDetached("worker", "worker.log", ["-w", "@exeq/api"]);
    log(`   Worker pid ${worker.pid} → ${worker.logFile}`);
  } else {
    log("   Worker omitido — NF_SYNC_PROCESSING=true (emissão síncrona na API)");
  }

  log("5/6 — Aguardando serviços...");
  const up = await waitServices();
  if (!up) {
    log("\nFALHA — API ou Admin não responderam. Ver .homolog/*.log");
    printHandoff(false);
    process.exit(1);
  }
  log("   API e Admin OK.\n");

  const tokenCheck = checkFocusProdToken();
  if (prodFocusProfile) {
    if (tokenCheck.ok) {
      log(`   ${tokenCheck.message}\n`);
    } else {
      log(`\n   AVISO PRODUÇÃO — ${tokenCheck.message}\n`);
    }
  }

  log("6/6 — Smoke QA...");
  const smoke = spawnSync("node", ["scripts/homolog-smoke.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: qaEnv,
    shell: true,
  });
  const smokeOk = smoke.status === 0;

  printHandoff(smokeOk);
  process.exit(smokeOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
