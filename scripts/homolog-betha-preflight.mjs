#!/usr/bin/env node
/**
 * S1-09 — Preflight Betha SOAP real (certificado + WSDL + gate).
 * Uso: npm run homolog:betha:preflight
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig, homologTestAmountCents, fetchWithRetry } from "./homolog-utils.mjs";
import { isHomologEmissionGateReady } from "../packages/shared/dist/homolog-emission-gate.js";
import { checkBethaPortalTpAmbAlignment } from "./betha-portal-tpamb.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const base = process.env.API_URL ?? homologConfig.apiBase;

async function main() {
  console.log("=== S1-09 — Preflight Betha SOAP real ===\n");
  console.log(`API: ${base}`);
  console.log(`Valor teste homolog: R$ ${(homologTestAmountCents / 100).toFixed(2)} (${homologTestAmountCents} centavos)\n`);

  const res = await fetchWithRetry(`${base}/health`);
  const health = await res.json();

  console.log("1/4 — /health");
  console.log(`   betha.mock: ${health.betha?.mock}`);
  console.log(`   betha.atibaia_enabled: ${health.betha?.atibaia_enabled}`);
  console.log(`   betha.certificate_configured: ${health.betha?.certificate_configured}`);
  console.log(`   betha.integration_mode: ${health.betha?.integration_mode ?? "?"}`);
  console.log(`   betha.dps_tp_amb: ${health.betha?.dps_tp_amb ?? "?"} (1=prod ADN, 2=homolog)`);
  console.log(`   betha.portal_ambiente: ${health.betha?.portal_ambiente ?? process.env.BETHA_PORTAL_AMBIENTE ?? "(não informado)"}`);

  const gate = isHomologEmissionGateReady(health);
  console.log("\n2/4 — Gate homolog");
  console.log(`   mode: ${gate.mode} ok=${gate.ok}`);
  if (!gate.ok) {
    console.error(`   ${gate.message}`);
  }

  console.log("\n3/4 — Checklist PO");
  const checks = [
    ["Certificado no vault", health.betha?.certificate_configured === true],
    ["BETHA_WSDL_URL configurado", health.betha?.wsdl_configured === true],
    ["BETHA_ATIBAIA_ENABLED", health.betha?.atibaia_enabled === true],
    ["BETHA_MOCK=false (SOAP real)", health.betha?.mock === false],
    ["HOMOLOG_TEST_AMOUNT_CENTS=100", homologTestAmountCents === 100],
  ];
  for (const [label, ok] of checks) {
    console.log(`   ${ok ? "OK" : "FALTA"} — ${label}`);
  }

  const wsdl = process.env.BETHA_WSDL_URL ?? "";
  const mode = process.env.BETHA_INTEGRATION_MODE ?? (wsdl.includes("/dps/") ? "dps" : "?");
  if (mode === "dps") {
    console.log("\n   OK — modo DPS (Nota Nacional / Atibaia 2026)");
    const tpAmb = Number(process.env.BETHA_DPS_TP_AMB ?? health.betha?.dps_tp_amb ?? 2);
    const portal =
      process.env.BETHA_PORTAL_AMBIENTE ?? health.betha?.portal_ambiente ?? undefined;
    const align = checkBethaPortalTpAmbAlignment(portal, tpAmb);
    if (!align.ok) {
      console.log(`   FALTA — ${align.error}`);
      console.log("   Ajuste .env.local ou portal Betha (Configurações/Perfil).");
      console.error("\nFALHA — portal Betha × tpAmb desalinhados. Corrija antes da emissão.\n");
      process.exit(1);
    } else if (portal) {
      console.log(`   OK — portal=${portal} alinhado com tpAmb=${tpAmb}`);
    } else {
      console.log("   AVISO — defina BETHA_PORTAL_AMBIENTE=homolog|producao no .env.local");
    }
    for (const w of align.warnings ?? []) {
      console.log(`   AVISO — ${w}`);
    }
  } else if (wsdl.includes("/rps/")) {
    console.log("\n   AVISO — BETHA_WSDL_URL aponta para RPS.");
    console.log("   Atibaia/2026 (Nota Nacional) exige DPS:");
    console.log("   https://nota-eletronica.betha.cloud/dps/ws/service.wsdl");
    console.log("   Rode: npm run homolog:betha:soap-probe");
  }

  console.log("\n4/4 — Próximo comando");
  if (gate.mode === "betha_atibaia_real") {
    console.log("   npm run homolog:emission:atibaia:betha:real\n");
    console.log("OK — Preflight Betha SOAP real\n");
    return;
  }
  if (gate.mode === "betha_atibaia_mock") {
    console.log("   Modo MOCK ativo — para SOAP real:");
    console.log("   .env.local: BETHA_MOCK=false + BETHA_WSDL_URL=<url>");
    console.log("   npm run homolog:ready-for-qa\n");
    console.log("OK — Preflight (mock) — certificado gravado, aguardando WSDL/real\n");
    return;
  }

  console.error("\nFALHA — preflight Betha\n");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
