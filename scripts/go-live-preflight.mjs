#!/usr/bin/env node
/**
 * US-GL-16-02 — Preflight go-live piloto (3 municípios H3).
 * Uso: npm run go-live:preflight
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withHomologSmoke = process.argv.includes("--homolog-smoke");

const steps = [
  { name: "Security", cmd: "node", args: ["scripts/ci-security-check.mjs"] },
  { name: "Build", cmd: "npm", args: ["run", "build"] },
  { name: "Lint", cmd: "npm", args: ["run", "lint"] },
  { name: "Database setup", cmd: "npm", args: ["run", "db:setup"] },
  { name: "Fase 9 (sistema piloto)", cmd: "npm", args: ["run", "test:phase9"] },
  { name: "Fase 10 (go-live smoke)", cmd: "npm", args: ["run", "test:phase10"] },
  { name: "Fiscal P0 (3 municípios)", cmd: "npm", args: ["run", "test:fiscal-p0-extended"] },
];

if (withHomologSmoke) {
  steps.push({
    name: "Homolog smoke API (stack deve estar up)",
    cmd: "node",
    args: ["scripts/homolog-smoke.mjs"],
  });
}

console.log("=== Go-live preflight — Release 2 / Sprint 16 ===\n");
console.log("Escopo PO: Atibaia, Bragança Paulista, Mairiporã (3 IBGE).\n");

let failed = false;
for (const step of steps) {
  console.log(`--- ${step.name} ---`);
  const result = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...step.env },
  });
  if (result.status !== 0) {
    console.error(`\nPREFLIGHT FALHOU em: ${step.name}\n`);
    failed = true;
    break;
  }
  console.log(`OK  ${step.name}\n`);
}

if (failed) {
  console.error("Corrija falhas antes do deploy. Ver GO_LIVE_PILOTO_CHECKLIST.md\n");
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  GO-LIVE PREFLIGHT OK — piloto 3 municípios                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Próximo: homolog:handoff:full (portal) em ambiente homolog      ║
║  Produção: GO_LIVE_PILOTO_CHECKLIST.md + smoke:prod (TI)         ║
╚══════════════════════════════════════════════════════════════════╝
`);
