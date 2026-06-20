#!/usr/bin/env node
/**
 * PO — grava certificado Betha (PFX base64) e senha no vault (tenant piloto-sp).
 * Nunca commitar o certificado. Preferir variáveis de ambiente.
 *
 * Uso:
 *   $env:BETHA_CERT_B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))
 *   $env:BETHA_CERT_PASSWORD = "senha"
 *   npm run homolog:betha:save-certificate
 *
 *   node scripts/save-betha-certificate-po.mjs --pfx-path C:\path\cert.pfx --password "senha"
 */
import { readFileSync } from "node:fs";
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
const pfxPath = getArg("--pfx-path");
const password = getArg("--password") ?? process.env.BETHA_CERT_PASSWORD;

let certBase64 = process.env.BETHA_CERT_B64?.trim();
if (!certBase64 && pfxPath) {
  certBase64 = readFileSync(pfxPath).toString("base64");
}

if (!certBase64 || certBase64.length < 100) {
  console.error(`
Certificado Betha nao informado.

PowerShell:
  $env:BETHA_CERT_B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\\caminho\\certificado.pfx"))
  $env:BETHA_CERT_PASSWORD = "sua-senha"
  npm run homolog:betha:save-certificate

Ou:
  node scripts/save-betha-certificate-po.mjs --pfx-path "C:\\caminho\\certificado.pfx" --password "sua-senha"

Nunca coloque PFX ou base64 em git.
`);
  process.exit(1);
}

if (!password || password.length < 1) {
  console.error("ERRO: informe BETHA_CERT_PASSWORD ou --password");
  process.exit(1);
}

function rotate(kind, value) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/rotate-tenant-secret.mjs"),
      "--tenant-slug",
      tenantSlug,
      "--kind",
      kind,
      "--value",
      value,
    ],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rotate("betha_certificate", certBase64);
rotate("betha_certificate_password", password);

console.log(`\nOK — Certificado Betha gravado para tenant ${tenantSlug}.`);
console.log("Configure .env.local: BETHA_ATIBAIA_ENABLED=true");
console.log("Homolog mock: BETHA_MOCK=true | Real: BETHA_MOCK=false + BETHA_WSDL_URL\n");
