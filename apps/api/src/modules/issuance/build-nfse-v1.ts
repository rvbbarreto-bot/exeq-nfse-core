import type { ExeqNfseV1, TaxRegime, TaxResolveResponse, MunicipalEmissionRulesDto } from "@exeq/shared";
import { exeqNfseV1Schema } from "@exeq/shared";
import { coerceAddressRecord } from "../../lib/json.js";

type ProviderRow = {
  document: string;
  legal_name: string;
  municipal_registration: string | null;
  tax_regime: TaxRegime;
  address: Record<string, unknown> | null;
};

type CustomerRow = {
  document: string;
  name: string;
  email: string | null;
  address: Record<string, unknown> | null;
};

type ServiceRow = {
  service_code: string;
  description: string;
};

export function buildExeqNfseV1(input: {
  provider: ProviderRow;
  customer: CustomerRow;
  service: ServiceRow;
  ibge_code: string;
  competence_date: string;
  amount_cents: number;
  tax: TaxResolveResponse;
  description?: string;
  regras_municipais?: MunicipalEmissionRulesDto;
}): ExeqNfseV1 {
  const dto: ExeqNfseV1 = {
    schema_version: "exeq.nfse.v1",
    prestador: {
      cnpj: input.provider.document,
      razao_social: input.provider.legal_name,
      inscricao_municipal: input.provider.municipal_registration ?? undefined,
      regime_tributario: input.provider.tax_regime,
      endereco: coerceAddressRecord(input.provider.address) as
        ExeqNfseV1["prestador"]["endereco"] | undefined,
    },
    tomador: {
      documento: input.customer.document,
      nome: input.customer.name,
      email: input.customer.email ?? undefined,
      endereco: coerceAddressRecord(input.customer.address) as
        ExeqNfseV1["tomador"]["endereco"] | undefined,
    },
    servico: {
      codigo: input.service.service_code,
      descricao: input.description ?? input.service.description,
      ibge_prestacao: input.ibge_code,
      valor_servico_cents: input.amount_cents,
      competencia: input.competence_date,
    },
    tributacao: {
      iss_aliquota: input.tax.resolved.iss_rate,
      iss_retido: input.tax.resolved.iss_retained,
      irrf_aliquota: input.tax.resolved.irrf_rate,
      pis_aliquota: input.tax.resolved.pis_rate,
      cofins_aliquota: input.tax.resolved.cofins_rate,
      csll_aliquota: input.tax.resolved.csll_rate,
      simples_codigo_tributacao: input.tax.resolved.simples_codigo_tributacao,
      codigo_tributacao_nacional_iss:
        (input.tax.focus_field_overrides?.codigo_tributacao_nacional_iss as string | undefined) ??
        undefined,
      focus_field_overrides: input.tax.focus_field_overrides,
    },
    regras_municipais: input.regras_municipais,
  };
  return exeqNfseV1Schema.parse(dto);
}
