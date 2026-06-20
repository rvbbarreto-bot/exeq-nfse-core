#!/usr/bin/env node
/**
 * P0 PO — Probe Focus Nacional Atibaia.
 * Uso: $env:PROD_EMISSION_CONFIRM="yes"; npm run homolog:p0:focus-nacional-atibaia
 */
import { homologConfig } from "./homolog-utils.mjs";

const base = process.env.API_URL ?? homologConfig.apiBase;

async function main() {
  console.log("=== P0 — Probe Focus Nacional Atibaia (3504107) ===\n");

  const health = await (await fetch(`${base}/health`)).json();
  console.log(`routing: ${health.atibaia_routing?.provider ?? "?"}`);
  console.log(`focus.mock: ${health.focus?.mock ?? "?"}`);

  if (health.atibaia_routing?.provider !== "focus_nacional") {
    console.error("BLOQUEADO — Atibaia deve rotear focus_nacional. Reinicie API/worker.");
    process.exit(1);
  }

  if (process.env.PROD_EMISSION_CONFIRM !== "yes") {
    console.error("Defina PROD_EMISSION_CONFIRM=yes");
    process.exit(1);
  }

  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npm", ["run", "prod:emission:atibaia"], {
    cwd: homologConfig.root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
