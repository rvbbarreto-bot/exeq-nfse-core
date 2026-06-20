#!/usr/bin/env node
/**
 * PO — grava token Focus PRODUÇÃO no vault (substitui token homolog no tenant).
 * Uso: FOCUS_TOKEN=xxx npm run prod:focus:save-token
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const tenantSlug = getArg("--tenant-slug") ?? "piloto-sp";
const value = getArg("--value") ?? process.env.FOCUS_TOKEN;

if (!value || value.trim().length < 8) {
  console.error(`
Token Focus PRODUCAO nao informado.

  $env:FOCUS_TOKEN = "seu-token-focus-PRODUCAO"
  npm run prod:focus:save-token

Token do painel Focus (producao) — NAO usar token de homologacao.
`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/rotate-tenant-secret.mjs"),
    "--tenant-slug",
    tenantSlug,
    "--kind",
    "focus_token",
    "--value",
    value.trim(),
  ],
  { cwd: root, stdio: "inherit", env: process.env },
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`\nOK — Token PRODUCAO gravado para tenant ${tenantSlug}.`);
console.log("Reinicie worker + API. Depois: PROD_EMISSION_CONFIRM=yes npm run prod:emission:atibaia\n");
