#!/usr/bin/env node
/**
 * Gate de handoff fábrica → PO/QA (DoD homolog portal).
 * Uso: npm run homolog:handoff
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withPortal = process.argv.includes("--portal");
const withGateway = process.argv.includes("--gateway");

console.log("=== Handoff homolog — Fábrica ===\n");

const smoke = spawnSync("node", ["scripts/homolog-smoke.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (smoke.status !== 0) {
  console.error("\nHANDOFF REJEITADO — corrija e rode: npm run homolog:doctor -- --fix\n");
  process.exit(1);
}

if (withPortal) {
  console.log("\n--- Gate portal (Playwright UAT-P0-01..09) ---\n");
  const e2e = spawnSync("node", ["scripts/homolog-e2e.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (e2e.status !== 0) {
    console.error("\nHANDOFF REJEITADO — homolog:e2e falhou (portal)\n");
    process.exit(1);
  }
}

if (withGateway) {
  console.log("\n--- Gate gateway HTTP (Sprint 14 — opcional) ---\n");
  if (process.env.GATEWAY_MOCK === "false") {
    const gwSmoke = spawnSync("node", ["scripts/homolog-gateway-smoke.mjs"], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    if (gwSmoke.status !== 0) {
      console.error("\nHANDOFF REJEITADO — homolog:gateway-smoke falhou\n");
      process.exit(1);
    }
  } else {
    console.log(
      "SKIP gateway HTTP — GATEWAY_MOCK≠false (mock OK para dev/CI). Para TI: copie .env.homolog.gateway.example\n",
    );
  }
}

const gateLabel = withPortal && withGateway
  ? "HOMOLOG LIBERADO — API + PORTAL + GATEWAY HTTP"
  : withPortal
    ? "HOMOLOG LIBERADO — API + PORTAL (UAT-P0-01..09)"
    : "HOMOLOG LIBERADO PARA UAT-17..22 (gate API)";

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  ${gateLabel.padEnd(62)}║
╠══════════════════════════════════════════════════════════════════╣
║  API:    ${homologConfig.apiBase.padEnd(52)}║
║  Admin:  ${homologConfig.adminBase.padEnd(52)}║
║  Login:  ${homologConfig.email.padEnd(52)}║
╠══════════════════════════════════════════════════════════════════╣
║  Portal: ${(withPortal ? "E2E UAT-P0-01..09 OK" : "homolog:handoff --portal").padEnd(52)}║
║  Gateway: ${(withGateway ? (process.env.GATEWAY_MOCK === "false" ? "HTTP smoke OK" : "mock (skip HTTP)") : "homolog:handoff --gateway").padEnd(52)}║
║  Prints PO opcionais: docs/DEMANDA_PO_FABRICA_HOMOLOG_PORTAL_100.md ║
╠══════════════════════════════════════════════════════════════════╣
║  Comandos: homolog:smoke → homolog:e2e → homolog:handoff --portal ║
╚══════════════════════════════════════════════════════════════════╝
`);

console.log("Anexe este log + prints do portal na Issue antes de avisar o PO.\n");
process.exit(0);
