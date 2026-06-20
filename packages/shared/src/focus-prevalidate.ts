import type { ExeqNfseV1 } from "./nfse-v1.js";

export type FocusPrevalidateIssue = {
  field: string;
  code: string;
  message: string;
};

export class FocusPrevalidateError extends Error {
  readonly issues: FocusPrevalidateIssue[];

  constructor(issues: FocusPrevalidateIssue[]) {
    super("FOCUS_PREVALIDATE_FAILED");
    this.name = "FocusPrevalidateError";
    this.issues = issues;
  }
}

import { PILOT_IBGE_CODES } from "./pilot-municipios.js";

const PILOT_IBGE = new Set(PILOT_IBGE_CODES);

/** Regras P0 extraídas do pré-validador (spec n8n) — pure function. */
export function prevalidateExeqNfseV1ForFocus(dto: ExeqNfseV1): FocusPrevalidateIssue[] {
  const issues: FocusPrevalidateIssue[] = [];

  if (!/^\d{14}$/.test(dto.prestador.cnpj)) {
    issues.push({
      field: "prestador.cnpj",
      code: "CNPJ_INVALIDO",
      message: "CNPJ do prestador deve ter 14 digitos",
    });
  }

  if (!PILOT_IBGE.has(dto.servico.ibge_prestacao)) {
    issues.push({
      field: "servico.ibge_prestacao",
      code: "MUNICIPIO_NAO_HOMOLOGADO",
      message: "Municipio fora do piloto homologado",
    });
  }

  if (dto.servico.valor_servico_cents <= 0) {
    issues.push({
      field: "servico.valor_servico_cents",
      code: "VALOR_INVALIDO",
      message: "Valor do servico deve ser maior que zero",
    });
  }

  if (dto.tributacao.iss_aliquota < 0 || dto.tributacao.iss_aliquota > 1) {
    issues.push({
      field: "tributacao.iss_aliquota",
      code: "ALIQUOTA_ISS_INVALIDA",
      message: "Aliquota ISS deve estar entre 0 e 1",
    });
  }

  if (
    dto.prestador.regime_tributario === "simples_nacional" &&
    dto.tributacao.simples_codigo_tributacao == null
  ) {
    issues.push({
      field: "tributacao.simples_codigo_tributacao",
      code: "SIMPLES_CODIGO_OBRIGATORIO",
      message: "Codigo tributacao Simples (1-3) obrigatorio",
    });
  }

  const doc = dto.tomador.documento;
  if (!/^\d{11}$/.test(doc) && !/^\d{14}$/.test(doc)) {
    issues.push({
      field: "tomador.documento",
      code: "DOCUMENTO_TOMADOR_INVALIDO",
      message: "Tomador deve ter CPF (11) ou CNPJ (14) digitos",
    });
  }

  if (dto.servico.descricao.trim().length < 2) {
    issues.push({
      field: "servico.descricao",
      code: "DESCRICAO_OBRIGATORIA",
      message: "Discriminacao do servico obrigatoria",
    });
  }

  return issues;
}

export function assertFocusPrevalidate(dto: ExeqNfseV1): void {
  const issues = prevalidateExeqNfseV1ForFocus(dto);
  if (issues.length > 0) throw new FocusPrevalidateError(issues);
}

export { PILOT_MUNICIPIOS as PILOT_MUNICIPALITIES } from "./pilot-municipios.js";
