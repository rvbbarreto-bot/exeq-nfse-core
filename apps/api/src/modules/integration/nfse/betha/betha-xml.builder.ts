import type { BethaRpsPayload } from "./betha-nfse.adapter.js";

/**
 * Monta XML RPS ABRASF (skeleton) — sem assinatura XMLDSig.
 * Implementação real depende do layout Betha/Atibaia e certificado ICP-Brasil.
 */
export function buildBethaRpsXml(payload: BethaRpsPayload): string {
  const { rps } = payload;
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Rps>",
    "  <InfRps>",
    `    <Numero>${esc(rps.numero)}</Numero>`,
    `    <Serie>${esc(rps.serie)}</Serie>`,
    `    <Tipo>${rps.tipo}</Tipo>`,
    `    <DataEmissao>${esc(rps.data_emissao)}</DataEmissao>`,
    `    <Competencia>${esc(rps.competencia)}</Competencia>`,
    "    <Servico>",
    `      <CodigoServico>${esc(rps.codigo_servico)}</CodigoServico>`,
    `      <ValorServicos>${rps.valor_servicos.toFixed(2)}</ValorServicos>`,
    `      <IssRetido>${rps.iss_retido ? 1 : 2}</IssRetido>`,
    `      <Aliquota>${rps.aliquota_iss}</Aliquota>`,
    "    </Servico>",
    "    <Prestador>",
    `      <Cnpj>${esc(rps.prestador_cnpj)}</Cnpj>`,
    "    </Prestador>",
    "    <Tomador>",
    `      <CpfCnpj>${esc(rps.tomador_documento)}</CpfCnpj>`,
    "    </Tomador>",
    "  </InfRps>",
    "</Rps>",
  ].join("\n");
}

/** Gate homolog — SOAP real só com flag explícita do PO. */
export function assertBethaHomologMockOnly(bethaMock: boolean, soapRealEnabled: boolean): void {
  if (soapRealEnabled && !bethaMock) {
    throw new Error("BETHA_SOAP_REAL_REQUIRES_PO_AUTHORIZATION");
  }
}
