import type { ExeqNfseV1, MunicipalEnderecoFallback } from "@exeq/shared";
import { DEFAULT_MUNICIPAL_EMISSION_RULES } from "@exeq/shared";

/**
 * Payload NFS-e Nacional (DPS) — layout plano Focus `/v2/nfsen`.
 * @see https://campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html
 */
export type FocusNfsenSubmitPayload = {
  data_emissao: string;
  data_competencia: string;
  codigo_municipio_emissora: number;
  cnpj_prestador: string;
  inscricao_municipal_prestador?: string;
  codigo_opcao_simples_nacional: number;
  regime_especial_tributacao: number;
  /** regApTribSN — obrigatório quando opSimpNac = 3 (ME/EPP). */
  regime_tributario_simples_nacional?: number;
  cpf_tomador?: string;
  cnpj_tomador?: string;
  razao_social_tomador: string;
  email_tomador?: string;
  codigo_municipio_tomador?: number;
  codigo_municipio_prestacao: number;
  codigo_tributacao_nacional_iss: string;
  descricao_servico: string;
  valor_servico: number;
  valor_iss: number;
  tributacao_iss: number;
  tipo_retencao_iss: number;
  cep_tomador: string;
  logradouro_tomador: string;
  numero_tomador: string;
  bairro_tomador: string;
  complemento_tomador?: string;
  percentual_total_tributos_federais: string;
  percentual_total_tributos_estaduais: string;
  percentual_total_tributos_municipais: string;
  situacao_tributaria_pis_cofins: string;
};

export type FocusSubmitResponse = {
  ref: string;
  status: string;
  raw: unknown;
};

export type FocusConsultResponse = {
  status: string;
  numero_nfse?: string;
  codigo_verificacao?: string;
  erros?: { codigo?: string; mensagem?: string }[];
  raw: unknown;
};

export type FocusCancelResponse = {
  status: string;
  raw: unknown;
};

export interface FocusClient {
  submitNfsen(token: string, ref: string, payload: FocusNfsenSubmitPayload): Promise<FocusSubmitResponse>;
  consultNfsen(token: string, ref: string): Promise<FocusConsultResponse>;
  cancelNfsen(token: string, ref: string, justificativa: string): Promise<FocusCancelResponse>;
}

/** LC 116 (ex.: 1.01) → código nacional ISS 6 dígitos (ex.: 010101). */
export function lc116ToCodigoTributacaoNacionalIss(serviceCode: string): string {
  const parts = serviceCode.trim().split(".");
  if (parts.length !== 2) {
    throw new Error(`FOCUS_LC116_INVALID:${serviceCode}`);
  }
  const [item, subitem] = parts;
  return `${item.padStart(2, "0")}${subitem.padStart(2, "0")}01`;
}

function parseIbge(code: string): number {
  const n = Number(code);
  if (!Number.isInteger(n) || code.length !== 7) {
    throw new Error(`FOCUS_IBGE_INVALID:${code}`);
  }
  return n;
}

function formatFocusDateTime(competenceDate: string): string {
  return `${competenceDate}T00:00:00-03:00`;
}

function resolveCodigoTributacaoNacionalIss(dto: ExeqNfseV1): string {
  const override =
    dto.tributacao.codigo_tributacao_nacional_iss ??
    (dto.tributacao.focus_field_overrides?.codigo_tributacao_nacional_iss as string | undefined);
  if (override) return override;
  return lc116ToCodigoTributacaoNacionalIss(dto.servico.codigo);
}

function resolveCodigoOpcaoSimplesNacional(dto: ExeqNfseV1): number {
  if (dto.prestador.regime_tributario === "simples_nacional") {
    return dto.tributacao.simples_codigo_tributacao ?? 3;
  }
  return 1;
}

/** regApTribSN — apuração SN (default: tributos federais + ISS pelo SN). */
function resolveRegimeTributarioSimplesNacional(dto: ExeqNfseV1): number | undefined {
  const override = dto.tributacao.focus_field_overrides?.regime_tributario_simples_nacional;
  if (typeof override === "number") return override;
  if (dto.prestador.regime_tributario !== "simples_nacional") return undefined;
  const opcao = resolveCodigoOpcaoSimplesNacional(dto);
  if (opcao === 2 || opcao === 3) return 1;
  return undefined;
}

function stripDigits(value: string): string {
  return value.replace(/\D/g, "");
}

type AddressLike = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  zip_code?: string;
  ibge_code?: string;
};

const GENERIC_HOMOLOG_ADDRESS: MunicipalEnderecoFallback = {
  street: "Rua Homologacao",
  number: "100",
  district: "Centro",
  zip_code: "01001000",
};

/** IBGE São Paulo (centro) — par CEP 01001000 (evita E0240 Focus) */
const GENERIC_HOMOLOG_IBGE = 3550308;

/** Fallback de endereço do tomador — fonte: regras municipais (payload_flags), não IBGE hardcoded. */
function resolveTomadorAddressFallback(dto: ExeqNfseV1): MunicipalEnderecoFallback {
  return dto.regras_municipais?.payload_flags?.endereco_tomador_fallback ?? GENERIC_HOMOLOG_ADDRESS;
}

function resolveAddress(
  addr: AddressLike | undefined,
  dto: ExeqNfseV1,
): Required<Pick<AddressLike, "street" | "number" | "district" | "zip_code">> & { complement?: string } {
  const fallback = resolveTomadorAddressFallback(dto);
  return {
    street: addr?.street?.trim() || fallback.street,
    number: addr?.number?.trim() || fallback.number,
    district: addr?.district?.trim() || fallback.district,
    zip_code: stripDigits(addr?.zip_code ?? "") || fallback.zip_code,
    complement: addr?.complement?.trim() || undefined,
  };
}

function resolveMunicipioEmissora(dto: ExeqNfseV1): number {
  const fromAddress = dto.prestador.endereco?.ibge_code;
  if (fromAddress) return parseIbge(fromAddress);
  return parseIbge(dto.servico.ibge_prestacao);
}

/** CEP × município tomador deve ser coerente (Focus E0240). */
function resolveCodigoMunicipioTomador(
  dto: ExeqNfseV1,
  tomadorAddr: ReturnType<typeof resolveAddress>,
  ibgePrestacao: number,
): number {
  const tomadorIbge = dto.tomador.endereco?.ibge_code;
  if (tomadorIbge) return parseIbge(tomadorIbge);

  const municipalFallback = resolveTomadorAddressFallback(dto);
  if (tomadorAddr.zip_code === municipalFallback.zip_code) {
    return ibgePrestacao;
  }
  if (tomadorAddr.zip_code === GENERIC_HOMOLOG_ADDRESS.zip_code) {
    return GENERIC_HOMOLOG_IBGE;
  }
  return ibgePrestacao;
}

/**
 * Decide inclusão de inscricao_municipal_prestador no payload Focus.
 * Fonte: regras_municipais (MunicipalRulesService) + override contador legado.
 */
export function shouldIncludeInscricaoMunicipalPrestador(dto: ExeqNfseV1): boolean {
  const enviarIm =
    dto.regras_municipais?.enviar_inscricao_municipal_prestador ??
    DEFAULT_MUNICIPAL_EMISSION_RULES.enviar_inscricao_municipal_prestador;

  if (!enviarIm) return false;

  if (dto.tributacao.focus_field_overrides?.omit_inscricao_municipal_prestador === true) {
    return false;
  }

  return Boolean(dto.prestador.inscricao_municipal?.trim());
}

export function mapExeqNfseV1ToFocusNfsen(dto: ExeqNfseV1): FocusNfsenSubmitPayload {
  const valorServico = Math.round((dto.servico.valor_servico_cents / 100) * 100) / 100;
  const valorIss = Math.round(valorServico * dto.tributacao.iss_aliquota * 100) / 100;
  const tomadorDoc = dto.tomador.documento.replace(/\D/g, "");
  const isCnpj = tomadorDoc.length === 14;
  const ibgePrestacao = parseIbge(dto.servico.ibge_prestacao);
  const ibgeEmissora = resolveMunicipioEmissora(dto);
  const tomadorAddr = resolveAddress(dto.tomador.endereco, dto);
  const issPercent = (dto.tributacao.iss_aliquota * 100).toFixed(2);

  const payload: FocusNfsenSubmitPayload = {
    data_emissao: formatFocusDateTime(dto.servico.competencia),
    data_competencia: dto.servico.competencia,
    codigo_municipio_emissora: ibgeEmissora,
    cnpj_prestador: dto.prestador.cnpj,
    codigo_opcao_simples_nacional: resolveCodigoOpcaoSimplesNacional(dto),
    regime_especial_tributacao: 0,
    razao_social_tomador: dto.tomador.nome,
    codigo_municipio_prestacao: ibgePrestacao,
    codigo_tributacao_nacional_iss: resolveCodigoTributacaoNacionalIss(dto),
    descricao_servico: dto.servico.descricao,
    valor_servico: valorServico,
    valor_iss: valorIss,
    tributacao_iss: 1,
    tipo_retencao_iss: dto.tributacao.iss_retido ? 2 : 1,
    cep_tomador: tomadorAddr.zip_code,
    logradouro_tomador: tomadorAddr.street,
    numero_tomador: tomadorAddr.number,
    bairro_tomador: tomadorAddr.district,
    percentual_total_tributos_federais: "0.00",
    percentual_total_tributos_estaduais: "0.00",
    percentual_total_tributos_municipais: issPercent,
    situacao_tributaria_pis_cofins: "00",
  };

  if (shouldIncludeInscricaoMunicipalPrestador(dto)) {
    payload.inscricao_municipal_prestador = dto.prestador.inscricao_municipal!;
  }

  const regApTribSn = resolveRegimeTributarioSimplesNacional(dto);
  if (regApTribSn != null) {
    payload.regime_tributario_simples_nacional = regApTribSn;
  }

  if (tomadorAddr.complement) {
    payload.complemento_tomador = tomadorAddr.complement;
  }

  if (isCnpj) {
    payload.cnpj_tomador = tomadorDoc;
  } else {
    payload.cpf_tomador = tomadorDoc;
  }

  if (dto.tomador.email) {
    payload.email_tomador = dto.tomador.email;
  }

  payload.codigo_municipio_tomador = resolveCodigoMunicipioTomador(dto, tomadorAddr, ibgePrestacao);

  return payload;
}
