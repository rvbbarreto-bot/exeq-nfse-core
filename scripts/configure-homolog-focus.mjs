#!/usr/bin/env node
/**
 * Configura ambiente local para homologacao Focus REAL (sem gravar token).
 * PO grava token depois: npm run homolog:focus:save-token
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

function setEnvKey(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

console.log("\n=== Configuracao homolog Focus (fábrica) ===\n");

if (!existsSync(envPath)) {
  console.error("Arquivo .env ausente. Rode setup-local.ps1 primeiro.");
  process.exit(1);
}

let envContent = readFileSync(envPath, "utf8");
envContent = setEnvKey(envContent, "FOCUS_BASE_URL", "https://homologacao.focusnfe.com.br");
envContent = setEnvKey(envContent, "FOCUS_MOCK", "false");
envContent = setEnvKey(envContent, "FOCUS_HOMOLOG_MOCK", "false");
envContent = setEnvKey(envContent, "NF_SYNC_PROCESSING", "false");
writeFileSync(envPath, envContent);
console.log("OK — .env atualizado (Focus homolog real, worker assincrono)");

console.log("\n--- Docker ---");
run("docker", ["compose", "up", "-d"]);

console.log("\n--- Build shared ---");
run("npm", ["run", "build", "-w", "@exeq/shared"]);

console.log("\n--- DB setup ---");
run("npm", ["run", "db:setup"]);

console.log(`
=== Configuracao fábrica concluida ===

Pendente PO:
  1. copy .env.homolog.focus.example .env.local  (CNPJ real = Focus)
  2. npm run homolog:focus:ensure-data
  3. $env:FOCUS_TOKEN = "token-focus-homolog"
     npm run homolog:focus:save-token
  4. npm run dev  +  npm run worker -w @exeq/api
  5. npm run homolog:emission:santo-andre

Guia: docs/HOMOLOG_FOCUS_PO.md
Demanda PO: ../Projeto_Emissao_NFSe/DEMANDA_FABRICA_CONFIG_HOMOLOG_FOCUS_v1.md
`);
