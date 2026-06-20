#!/usr/bin/env node
/**
 * PO — grava token Focus no vault (tenant piloto-sp).
 * Nunca commitar o token. Preferir variável de ambiente.
 *
 * Uso:
 *   FOCUS_TOKEN=xxx npm run homolog:focus:save-token
 *   node scripts/save-focus-token-po.mjs --value "xxx"
 *   node scripts/save-focus-token-po.mjs --tenant-slug piloto-sp
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
Token Focus nao informado.

Como PO, use UMA das opcoes:

  PowerShell:
    $env:FOCUS_TOKEN = "seu-token-focus-homolog"
    npm run homolog:focus:save-token

  Ou:
    node scripts/save-focus-token-po.mjs --value "seu-token"

O token vem do painel Focus (homologacao). Nunca coloque em git.
`);
  process.exit(1);
}

if (value.includes("placeholder") || value.includes("sandbox-focus-token")) {
  console.error("ERRO: token parece ser placeholder. Use o token real da Focus.");
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

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`\nOK — Token focus_token gravado para tenant ${tenantSlug}.`);
console.log("Proximo passo PO: npm run homolog:focus:ensure-data (com .env.local do prestador real)");
console.log("Depois: npm run dev + npm run worker -w @exeq/api + emissao teste\n");
