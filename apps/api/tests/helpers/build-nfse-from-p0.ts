import type { ExeqNfseV1, FiscalP0Fixture, MunicipalEmissionRulesDto } from "@exeq/shared";

/** Monta DTO exeq.nfse.v1 a partir de fixture P0 (testes adapter/homolog). */
export function buildNfseV1FromP0Fixture(
  fixture: FiscalP0Fixture,
  amountCents = 150000,
  regras_municipais?: MunicipalEmissionRulesDto,
): ExeqNfseV1 {
  return {
    schema_version: "exeq.nfse.v1",
    prestador: {
      cnpj: "11222333000181",
      razao_social: "Prestador Piloto LTDA",
      inscricao_municipal: "12345",
      regime_tributario: fixture.input.tax_regime,
    },
    tomador: {
      documento: "52998224725",
      nome: "Tomador Homologacao",
    },
    servico: {
      codigo: fixture.input.service_code,
      descricao: fixture.input.service_description,
      ibge_prestacao: fixture.input.ibge_code,
      valor_servico_cents: amountCents,
      competencia: fixture.input.competence_date,
    },
    tributacao: {
      iss_aliquota: fixture.expected.iss_rate,
      iss_retido: fixture.expected.iss_retained,
      irrf_aliquota: fixture.expected.irrf_rate,
      pis_aliquota: fixture.expected.pis_rate,
      cofins_aliquota: fixture.expected.cofins_rate,
      csll_aliquota: fixture.expected.csll_rate,
      simples_codigo_tributacao: fixture.expected.simples_codigo_tributacao,
    },
    regras_municipais,
  };
}
