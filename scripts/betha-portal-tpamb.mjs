#!/usr/bin/env node
/**
 * Valida alinhamento portal Betha × tpAmb DPS.
 * E270 = mismatch | E130 = homolog DPS suspenso (Nota Nacional)
 */
export function expectedTpAmbForPortal(portalAmbiente) {
  if (portalAmbiente === "homolog") return 2;
  if (portalAmbiente === "producao") return 1;
  return null;
}

export function checkBethaPortalTpAmbAlignment(portalAmbiente, tpAmb) {
  const expected = expectedTpAmbForPortal(portalAmbiente);
  if (expected === null) {
    return { ok: true, warnings: [] };
  }
  const warnings = [];
  if (tpAmb !== expected) {
    return {
      ok: false,
      expected,
      error: `E270 — portal=${portalAmbiente} exige BETHA_DPS_TP_AMB=${expected}, configurado=${tpAmb}`,
    };
  }
  if (portalAmbiente === "homolog" && tpAmb === 2) {
    warnings.push(
      "Portal homolog + tpAmb=2: Betha pode retornar E130 (homolog DPS Nota Nacional suspenso).",
    );
    warnings.push(
      "Alternativa PO: desativar homolog no portal Betha → BETHA_PORTAL_AMBIENTE=producao + BETHA_DPS_TP_AMB=1 (NFS-e real R$ 1,00 ADN).",
    );
  }
  if (portalAmbiente === "producao" && tpAmb === 1) {
    warnings.push("Portal produção + tpAmb=1: NFS-e real no Ambiente Nacional (ADN).");
  }
  return { ok: true, expected, warnings };
}
