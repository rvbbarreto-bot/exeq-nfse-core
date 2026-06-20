#!/usr/bin/env node
/**
 * Sprint 15 prep — gate antes de implementar 5º município (exige CR PO).
 * Exit 0 = pacote prep OK | 1 = falha | 2 = CR PO ausente (bloqueio esperado).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDocsRoot() {
  const candidates = [
    path.resolve(root, "../docs"),
    path.resolve(root, "../EmissaoNFSe/docs"),
    path.resolve(root, "../../EmissaoNFSe/docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "MUNICIPIOS_PILOTO_v3.md"))) return candidate;
  }
  return candidates[0];
}

const docsRoot = resolveDocsRoot();

function docsPath(...parts) {
  return path.join(docsRoot, ...parts);
}

function fail(msg) {
  console.error(`FALHA: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function main() {
  console.log("=== Sprint 15 preflight (5º município) ===\n");

  const crSigned = process.env.SPRINT15_CR_PO_SIGNED === "true";
  const crPath = docsPath("evidencias/CR_PO_5O_MUNICIPIO_ASSINADO.md");

  if (!crSigned && !existsSync(crPath)) {
    console.log("BLOQUEIO: CR PO não assinado (esperado).");
    console.log(`  Quando PO assinar, criar: docs/evidencias/CR_PO_5O_MUNICIPIO_ASSINADO.md`);
    console.log(`  Ou rodar: SPRINT15_CR_PO_SIGNED=true npm run sprint15:preflight\n`);
  }

  const v3 = docsPath("MUNICIPIOS_PILOTO_v3.md");
  if (!existsSync(v3)) fail("MUNICIPIOS_PILOTO_v3.md ausente");
  ok("MUNICIPIOS_PILOTO_v3.md");

  const template = docsPath("templates/CR_PO_5O_MUNICIPIO_TEMPLATE.md");
  if (!existsSync(template)) fail("CR template ausente");
  ok("CR_PO_5O_MUNICIPIO_TEMPLATE.md");

  const pilotTs = path.join(root, "packages/shared/src/pilot-municipios.ts");
  const src = readFileSync(pilotTs, "utf-8");
  if (!src.includes("PILOT_MUNICIPIO_5TH_CANDIDATES")) {
    fail("PILOT_MUNICIPIO_5TH_CANDIDATES ausente em pilot-municipios.ts");
  }
  const opCount = (src.match(/PILOT_MUNICIPIOS:\s*PilotMunicipio\[\]\s*=\s*\[/g) ?? []).length;
  if (!src.includes('ibge_code: "3504107"')) fail("Atibaia ausente");
  if (src.includes('PILOT_MUNICIPIOS') && src.match(/PILOT_MUNICIPIOS:\s*PilotMunicipio\[\]\s*=\s*\[[\s\S]*?\];/)) {
    const block = src.match(/PILOT_MUNICIPIOS:\s*PilotMunicipio\[\]\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
    const ibgeInOps = (block.match(/ibge_code:/g) ?? []).length;
    const expectedOps = crSigned || existsSync(crPath) ? 4 : 3;
    if (ibgeInOps !== expectedOps) {
      fail(`PILOT_MUNICIPIOS deve ter ${expectedOps} IBGE (tem ${ibgeInOps})`);
    }
  }
  ok("PILOT_MUNICIPIOS operacionais conferidos");

  if (!crSigned && !existsSync(crPath)) {
    process.exit(2);
  }

  ok("CR PO presente — fábrica pode abrir feat/sprint-15-5o-municipio (implementação)");
  console.log("\nPreflight Sprint 15: PASS (desbloqueado para implementação).");
}

main();
