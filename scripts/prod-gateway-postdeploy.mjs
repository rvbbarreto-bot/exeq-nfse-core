#!/usr/bin/env node
/**
 * Sprint 19 — pós-deploy: smoke gateway + webhook paid opcional.
 * 1) npm run smoke:gateway-prod (via import dinâmico do fluxo)
 * 2) Se CHARGE_ID definido, orienta uat:webhook-paid
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("=== Pós-deploy gateway (Sprint 19) ===\n");

const smoke = spawnSync("node", ["scripts/smoke-gateway-prod.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (smoke.status === 2) {
  console.log("\nSmoke ignorado — aguardando TI (GATEWAY_MOCK=false + credenciais).");
  process.exit(0);
}
if (smoke.status !== 0) {
  process.exit(smoke.status ?? 1);
}

const chargeId = process.env.CHARGE_ID;
if (chargeId) {
  console.log(`\nSimulando webhook paid para charge ${chargeId}...`);
  const webhook = spawnSync(
    "node",
    ["scripts/uat-webhook-paid.mjs", chargeId],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  process.exit(webhook.status ?? 0);
}

console.log("\nOpcional: após pagamento no sandbox TI:");
console.log("  CHARGE_ID=<uuid> npm run uat:webhook-paid");
console.log("  (ou npm run prod:gateway-postdeploy com CHARGE_ID no ambiente)");
