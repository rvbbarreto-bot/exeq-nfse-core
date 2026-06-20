#!/usr/bin/env node
/**
 * Gate consolidado Trilha A — canal WhatsApp homolog (S1-04).
 * Uso: npm run homolog:channel:gate
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  ["homolog:channel:webhook-smoke", "P1 inbound webhook"],
  ["homolog:channel:outbound-smoke:seed", "P3 outbound Evolution"],
  ["homolog:channel:cutover", "Cutover canal V13 + ack"],
];

console.log("=== Gate Trilha A — Canal WhatsApp ===\n");

let failed = false;
for (const [script, label] of steps) {
  console.log(`--- ${label} (${script}) ---\n`);
  const r = spawnSync("npm", ["run", script], { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\nFALHA — ${script}\n`);
    failed = true;
    break;
  }
  console.log("");
}

if (failed) process.exit(1);
console.log("OK — Gate Trilha A completo (webhook + outbound + cutover)\n");
