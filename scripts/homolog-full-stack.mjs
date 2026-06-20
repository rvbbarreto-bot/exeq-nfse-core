#!/usr/bin/env node
/**
 * Homolog completo: infra + API + portal + worker + canal (n8n + Evolution).
 * Uso: npm run homolog:full
 */
import { spawnSync } from "node:child_process";
import { homologConfig } from "./homolog-utils.mjs";

const root = homologConfig.root;

function run(label, args) {
  console.log(`\n>>> ${label}\n`);
  const r = spawnSync("node", args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\nFALHA em: ${label}`);
    process.exit(r.status ?? 1);
  }
}

run("Infra base (Postgres + Redis)", ["scripts/homolog-ready-for-qa.mjs"]);
run("Stack canal (n8n + Evolution)", ["scripts/channel-stack.mjs", "up"]);

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  HOMOLOG COMPLETO — links                                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Portal:    ${homologConfig.adminBase.padEnd(52)}║
║  Login:     admin@piloto.local / changeme                        ║
║  API:       ${homologConfig.apiBase.padEnd(52)}║
║  n8n:       http://localhost:5680  (admin / homolog-n8n-admin)  ║
║  Evolution: http://localhost:8082                              ║
╚══════════════════════════════════════════════════════════════════╝
`);
