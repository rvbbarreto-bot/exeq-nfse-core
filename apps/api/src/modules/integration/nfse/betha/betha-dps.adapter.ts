import type { ExeqNfseV1 } from "@exeq/shared";
import { lc116ToCodigoTributacaoNacionalIss } from "../../focus/focus-nfsen.adapter.js";

export type BethaDpsPayload = {
  infDpsId: string;
  tpAmb: 1 | 2;
  dhEmi: string;
  serie: string;
  nDps: string;
  dCompet: string;
  cLocEmi: string;
  prestadorCnpj: string;
  prestadorFone: string;
  prestadorEmail: string;
  opSimpNac: 1 | 2 | 3;
  regApTribSN: 1 | 2 | 3;
  tomadorDocumento: string;
  tomadorNome: string;
  tomadorEmail: string;
  tomadorFone: string;
  tomadorCep: string;
  tomadorCMun: string;
  tomadorLogradouro: string;
  tomadorNumero: string;
  tomadorBairro: string;
  cLocPrestacao: string;
  cTribNac: string;
  xDescServ: string;
  cNbs: string;
  vServ: number;
  pAliq: number;
  issRetido: boolean;
  pTotTribFed: number;
  pTotTribEst: number;
  pTotTribMun: number;
};

/** Data/hora emissão DPS — fuso America/Sao_Paulo (Betha interpreta sem offset). */
export function formatBethaDhEmi(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export function brazilTodayIsoDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function padLeft(value: string, length: number, char = "0"): string {
  return value.slice(-length).padStart(length, char);
}

/** Gera identificador infDPS conforme padrão nacional (47 chars após prefixo DPS). */
export function buildInfDpsId(
  ibge: string,
  cnpj: string,
  serie: string,
  nDps: string,
): string {
  const cnpjDigits = cnpj.replace(/\D/g, "").slice(0, 14);
  const seriePadded = padLeft(serie.replace(/\D/g, ""), 5);
  const nDpsPadded = padLeft(nDps.replace(/\D/g, ""), 15);
  return `DPS${padLeft(ibge, 7)}2${cnpjDigits}${seriePadded}${nDpsPadded}`;
}

function mapCodigoTribNac(dto: ExeqNfseV1): string {
  if (dto.tributacao.codigo_tributacao_nacional_iss) {
    return dto.tributacao.codigo_tributacao_nacional_iss;
  }
  const override = dto.tributacao.focus_field_overrides?.codigo_tributacao_nacional_iss as
    | string
    | undefined;
  if (override) return override;
  return lc116ToCodigoTributacaoNacionalIss(dto.servico.codigo);
}

function deriveNDps(externalRef: string): string {
  const digits = externalRef.replace(/\D/g, "");
  if (digits.length >= 6) return padLeft(digits.slice(-15), 15);
  let hash = 0;
  for (let i = 0; i < externalRef.length; i++) {
    hash = (hash * 31 + externalRef.charCodeAt(i)) >>> 0;
  }
  return padLeft(String(hash), 15);
}

export function mapExeqNfseV1ToBethaDps(
  dto: ExeqNfseV1,
  externalRef: string,
  opts?: { tpAmb?: 1 | 2; defaultNbs?: string },
): BethaDpsPayload {
  const tpAmb = opts?.tpAmb ?? 1;
  const serie = "900";
  const nDps = deriveNDps(externalRef);
  const ibge = dto.servico.ibge_prestacao;
  const cnpj = dto.prestador.cnpj.replace(/\D/g, "");
  const end = dto.tomador.endereco;

  const todayBr = brazilTodayIsoDate();
  const dCompet = dto.servico.competencia > todayBr ? todayBr : dto.servico.competencia;

  return {
    infDpsId: buildInfDpsId(ibge, cnpj, serie, nDps),
    tpAmb,
    dhEmi: formatBethaDhEmi(),
    serie,
    nDps,
    dCompet,
    cLocEmi: ibge,
    prestadorCnpj: cnpj,
    prestadorFone: "11999999999",
    prestadorEmail: "fiscal@exeq.com.br",
    opSimpNac: dto.prestador.regime_tributario === "simples_nacional" ? 3 : 1,
    regApTribSN: dto.prestador.regime_tributario === "simples_nacional" ? 2 : 1,
    tomadorDocumento: dto.tomador.documento.replace(/\D/g, ""),
    tomadorNome: dto.tomador.nome,
    tomadorEmail: dto.tomador.email ?? "tomador@homolog.local",
    tomadorFone: "11999999999",
    tomadorCep: (end?.zip_code ?? "12940000").replace(/\D/g, "").slice(0, 8),
    tomadorCMun: end?.ibge_code ?? ibge,
    tomadorLogradouro: end?.street ?? "Nao informado",
    tomadorNumero: end?.number ?? "SN",
    tomadorBairro: end?.district ?? "Centro",
    cLocPrestacao: ibge,
    cTribNac: mapCodigoTribNac(dto),
    xDescServ: dto.servico.descricao.slice(0, 2000),
    cNbs: opts?.defaultNbs ?? "115013000",
    vServ: dto.servico.valor_servico_cents / 100,
    pAliq: Math.max(2, Math.min(5, dto.tributacao.iss_aliquota * 100 || 2)),
    issRetido: dto.tributacao.iss_retido,
    pTotTribFed: 0,
    pTotTribEst: 0,
    pTotTribMun: 0,
  };
}
