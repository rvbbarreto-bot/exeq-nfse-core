#!/usr/bin/env node
/**
 * Configura ambiente local para Focus PRODUÇÃO (emissão real).
 * PO grava token produção: npm run prod:focus:save-token
 *
 * Reverter homolog: npm run homolog:focus:configure
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const localPath = path.join(root, ".env.local");

function setEnvKey(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

function applyProdFocusKeys(content) {
  let next = content;
  next = setEnvKey(next, "EXEQ_FOCUS_PROFILE", "production");
  next = setEnvKey(next, "FOCUS_BASE_URL", "https://api.focusnfe.com.br");
  next = setEnvKey(next, "FOCUS_MOCK", "false");
  next = setEnvKey(next, "FOCUS_HOMOLOG_MOCK", "false");
  /** Síncrono na API — canal WhatsApp + poll pending sem worker órfão */
  next = setEnvKey(next, "NF_SYNC_PROCESSING", "true");
  return next;
}

console.log("\n=== Configuracao Focus PRODUCAO (PO) ===\n");

if (!existsSync(envPath)) {
  console.error("Arquivo .env ausente. Rode setup-local.ps1 primeiro.");
  process.exit(1);
}

let envContent = applyProdFocusKeys(readFileSync(envPath, "utf8"));
writeFileSync(envPath, envContent);

let localContent = existsSync(localPath) ? readFileSync(localPath, "utf8") : "";
localContent = applyProdFocusKeys(localContent);
writeFileSync(localPath, localContent);

console.log("OK — .env + .env.local → https://api.focusnfe.com.br (PRODUCAO, mock off)");
console.log("     EXEQ_FOCUS_PROFILE=production (mantido em homolog:ready-for-qa)");
console.log(`
ATENCAO — emissao real. Proximos passos:

  1. Token PRODUCAO no vault (diferente do homolog):
     $env:FOCUS_TOKEN = "token-focus-producao"
     npm run prod:focus:save-token

  2. Reiniciar API + worker (obrigatorio apos mudar FOCUS_BASE_URL):
     npm run dev
     npm run worker -w @exeq/api

  3. Teste diagnostico Atibaia:
     $env:PROD_EMISSION_CONFIRM = "yes"
     npm run prod:emission:atibaia

Reverter homolog: npm run homolog:focus:configure
`);
