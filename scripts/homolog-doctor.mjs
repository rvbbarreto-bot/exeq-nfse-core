#!/usr/bin/env node
/**
 * Diagnóstico e correção do ambiente homolog (Windows/local).
 *   npm run homolog:doctor          # só diagnóstico
 *   npm run homolog:doctor -- --fix # corrige e sobe API+admin em background
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  homologConfig,
  fetchExeqHealth,
  fetchAdmin,
  killPortListeners,
  dockerComposeUp,
} from "./homolog-utils.mjs";
import { checkGatewayPaymentUrlColumn } from "./schema-gate-charge.mjs";

const fix = process.argv.includes("--fix");

function line(msg) {
  console.log(msg);
}

async function diagnose() {
  line("\n--- Diagnóstico ---\n");

  const health = await fetchExeqHealth();
  line(
    health.ok
      ? `✓ API Exeq em :${homologConfig.apiPort} (phase ${health.json.phase})`
      : `✗ API Exeq em :${homologConfig.apiPort} — ${health.error ?? JSON.stringify(health.json)}`,
  );

  if (health.json?.service && health.json.service !== "exeq-nfse-core-api") {
    line(`  ⚠ Porta ${homologConfig.apiPort} está com OUTRO serviço: ${health.json.service}`);
    line(`  ⚠ Conflito comum: barbearia na 3000; Exeq deve usar PORT=3002 no .env`);
  }

  const redisUrl = process.env.REDIS_URL ?? "";
  if (redisUrl.includes(":6380")) {
    line("  ⚠ REDIS_URL :6380 colide com barbearia-saas — use :6382 (exeq-nfse-core)");
  }

  const admin = await fetchAdmin();
  line(admin.ok ? `✓ Admin em :${homologConfig.adminPort}` : `✗ Admin em :${homologConfig.adminPort} — ${admin.error ?? "off"}`);

  const gw = process.env.GATEWAY_SYNC_PROCESSING === "true";
  line(gw ? "✓ GATEWAY_SYNC_PROCESSING=true" : "✗ GATEWAY_SYNC_PROCESSING não está true (UAT-17 falha)");

  const gatewayMock = process.env.GATEWAY_MOCK !== "false";
  line(
    gatewayMock
      ? "✓ GATEWAY_MOCK=true (mock — dev/CI)"
      : "⚠ GATEWAY_MOCK=false (HTTP real — exige gateway_key + GATEWAY_BASE_URL)",
  );
  if (!gatewayMock) {
    const baseUrl = process.env.GATEWAY_BASE_URL?.trim();
    line(baseUrl ? `✓ GATEWAY_BASE_URL=${baseUrl}` : "✗ GATEWAY_BASE_URL ausente com MOCK=false");
    line("  Perfil: .env.homolog.gateway.example + RUNBOOK_GATEWAY_TI.md");
  }

  try {
    const { execSync } = await import("node:child_process");
    const ps = execSync("docker compose ps", { cwd: homologConfig.root, encoding: "utf8" });
    const pg = ps.includes("postgres") && ps.includes("Up");
    const rd = ps.includes("redis") && ps.includes("Up");
    line(pg ? "✓ Postgres Docker" : "✗ Postgres Docker");
    line(rd ? "✓ Redis Docker" : "✗ Redis Docker");
  } catch {
    line("✗ Docker Compose indisponível");
  }

  const schemaCol = checkGatewayPaymentUrlColumn();
  if (schemaCol === true) {
    line("✓ Schema charge.gateway_payment_url (Sprint 10/18)");
  } else if (schemaCol === false) {
    line("✗ Schema charge.gateway_payment_url AUSENTE — rode: npm run db:migrate");
  } else {
    line("⚠ Schema charge.gateway_payment_url não verificado (Docker off)");
  }

  const schemaOk = schemaCol !== false;
  return health.ok && admin.ok && gw && schemaOk;
}

function startDetached(npmScript, logName) {
  const logDir = path.join(homologConfig.root, ".homolog");
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, logName);

  const child = spawn("npm", ["run", npmScript], {
    cwd: homologConfig.root,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
    env: process.env,
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
  }, 10000);

  return { pid: child.pid, logFile };
}

async function applyFix() {
  line("\n--- Correção (--fix) ---\n");

  line(`Encerrando processos nas portas ${homologConfig.apiPort} e ${homologConfig.adminPort}...`);
  killPortListeners(homologConfig.apiPort);
  killPortListeners(homologConfig.adminPort);
  await new Promise((r) => setTimeout(r, 2000));

  line("Subindo Docker...");
  dockerComposeUp();
  await new Promise((r) => setTimeout(r, 5000));

  line("migrate + seed...");
  await new Promise((resolve, reject) => {
    const p = spawn("npm", ["run", "db:setup"], {
      cwd: homologConfig.root,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`db:setup exit ${c}`))));
  });

  const api = startDetached("dev", "api.log");
  line(`API iniciada (pid ${api.pid}) → log .homolog/api.log`);

  await new Promise((r) => setTimeout(r, 4000));
  const admin = startDetached("dev:admin", "admin.log");
  line(`Admin iniciada (pid ${admin.pid}) → log .homolog/admin.log`);

  line("\nAguardando serviços (até 60s)...");
  for (let i = 0; i < 30; i++) {
    const h = await fetchExeqHealth();
    const a = await fetchAdmin();
    if (h.ok && a.ok) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  line("Homolog Doctor — Exeq NFS-e");
  line(`API :${homologConfig.apiPort} | Admin :${homologConfig.adminPort}`);

  let ok = await diagnose();

  if (!ok && fix) {
    await applyFix();
    ok = await diagnose();
  } else if (!ok) {
    line("\nExecute: npm run homolog:doctor -- --fix");
    line("Ou em foreground: npm run homolog  (deixe o terminal aberto)");
    process.exit(1);
  }

  line("\nExecute o gate QA: npm run homolog:smoke");
  line("Handoff PO: npm run homolog:handoff");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
