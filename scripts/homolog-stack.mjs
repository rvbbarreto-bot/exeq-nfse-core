#!/usr/bin/env node
/**
 * Sobe infra (Docker) + API + Admin para homolog local e mantém no ar (restart automático).
 *
 * Uso:
 *   npm run homolog          # infra + db + API + admin (foreground)
 *   npm run homolog:infra    # só Postgres + Redis
 *   npm run homolog:status   # health check
 *
 * Pare com Ctrl+C (encerra API e admin; Docker continua rodando).
 */
import { spawn } from "node:child_process";
import {
  homologConfig,
  fetchExeqHealth,
  fetchAdmin,
} from "./homolog-utils.mjs";

const root = homologConfig.root;
const apiPort = homologConfig.apiPort;
const adminPort = homologConfig.adminPort;
const mode = process.argv[2] ?? "all";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      shell: true,
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
  });
}

async function waitForApi(attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    if ((await fetchExeqHealth(apiPort)).ok) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function waitForAdmin(attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    if ((await fetchAdmin(adminPort)).ok) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function dockerUp() {
  console.log("\n[homolog] Docker Compose (Postgres + Redis)...");
  await run("docker", ["compose", "up", "-d"]);
  console.log("[homolog] Aguardando Postgres/Redis (5s)...");
  await new Promise((r) => setTimeout(r, 5000));
}

async function dbSetup() {
  console.log("\n[homolog] migrate + seed...");
  await run("npm", ["run", "db:setup"]);
}

const children = [];

function spawnService(name, npmScript) {
  const start = () => {
    console.log(`\n[homolog] iniciando ${name} (${npmScript})...`);
    const child = spawn("npm", ["run", npmScript], {
      cwd: root,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    children.push(child);
    child.on("exit", (code, signal) => {
      if (signal === "SIGINT" || signal === "SIGTERM") return;
      console.warn(`[homolog] ${name} parou (code=${code ?? signal}). Reiniciando em 3s...`);
      setTimeout(start, 3000);
    });
    return child;
  };
  return start();
}

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Homolog Exeq NFS-e — ambiente local                     ║
╠══════════════════════════════════════════════════════════╣
║  API:    http://localhost:${String(apiPort).padEnd(5)}  GET /health       ║
║  Admin:  http://localhost:${String(adminPort).padEnd(5)}                   ║
║  Login:  admin@piloto.local / changeme                   ║
║  QA:     npm run uat:charge                              ║
╠══════════════════════════════════════════════════════════╣
║  Ctrl+C para parar API e Admin (Docker permanece)        ║
╚══════════════════════════════════════════════════════════╝
`);
}

async function startApps() {
  printBanner();

  const apiUrl = `http://localhost:${apiPort}/health`;
  const adminUrl = `http://localhost:${adminPort}`;

  if (!(await fetchExeqHealth(apiPort)).ok) {
    spawnService("API", "dev");
  } else {
    console.log(`[homolog] API Exeq já em execução → ${apiUrl}`);
  }

  if (!(await fetchAdmin(adminPort)).ok) {
    spawnService("Admin", "dev:admin");
  } else {
    console.log(`[homolog] Admin já em execução → ${adminUrl}`);
  }

  if (!(await waitForApi(60, 1000))) {
    console.error(`[homolog] API Exeq não respondeu em ${apiUrl}`);
    console.error("[homolog] Tente: npm run homolog:doctor -- --fix");
    process.exit(1);
  }
  console.log(`[homolog] API OK → ${apiUrl}`);

  if (!(await waitForAdmin(40, 1000))) {
    console.warn(`[homolog] Admin ainda subindo em ${adminUrl}`);
  } else {
    console.log(`[homolog] Admin OK → ${adminUrl}`);
  }

  console.log("[homolog] Gate QA: npm run homolog:smoke");
}

function shutdown() {
  console.log("\n[homolog] encerrando API e Admin...");
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  if (mode === "infra") {
    await dockerUp();
    console.log("[homolog] Infra pronta. Rode: npm run homolog:apps");
    return;
  }

  if (mode === "apps") {
    await startApps();
    await new Promise(() => {});
    return;
  }

  await dockerUp();
  if (process.env.SKIP_DB_SETUP !== "true") {
    await dbSetup();
  }
  await startApps();
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[homolog] falha:", err.message);
  process.exit(1);
});
