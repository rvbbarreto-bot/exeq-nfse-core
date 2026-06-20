import { describe, expect, it } from "vitest";
import {
  lc116ToCodigoTributacaoNacionalIss,
  mapExeqNfseV1ToFocusNfsen,
  shouldIncludeInscricaoMunicipalPrestador,
} from "./focus-nfsen.adapter.js";

const baseDto = {
  schema_version: "exeq.nfse.v1" as const,
  prestador: {
    cnpj: "11222333000181",
    razao_social: "Prestador LTDA",
    inscricao_municipal: "12345",
    regime_tributario: "simples_nacional" as const,
  },
  tomador: {
    documento: "52998224725",
    nome: "Tomador Teste",
  },
  servico: {
    codigo: "1.01",
    descricao: "Analise de sistemas",
    ibge_prestacao: "3504107",
    valor_servico_cents: 150000,
    competencia: "2026-06-01",
  },
  tributacao: {
    iss_aliquota: 0.02,
    iss_retido: false,
    irrf_aliquota: 0,
    pis_aliquota: 0,
    cofins_aliquota: 0,
    csll_aliquota: 0,
    simples_codigo_tributacao: 3,
  },
};

describe("lc116ToCodigoTributacaoNacionalIss", () => {
  it("mapeia 1.01 para 010101", () => {
    expect(lc116ToCodigoTributacaoNacionalIss("1.01")).toBe("010101");
  });
});

describe("shouldIncludeInscricaoMunicipalPrestador", () => {
  it("Atibaia — regras municipais proíbem IM (E0120)", () => {
    expect(
      shouldIncludeInscricaoMunicipalPrestador({
        ...baseDto,
        regras_municipais: { enviar_inscricao_municipal_prestador: false },
      }),
    ).toBe(false);
  });

  it("município genérico — envia IM quando cadastrada", () => {
    expect(
      shouldIncludeInscricaoMunicipalPrestador({
        ...baseDto,
        servico: { ...baseDto.servico, ibge_prestacao: "3507605" },
        regras_municipais: { enviar_inscricao_municipal_prestador: true },
      }),
    ).toBe(true);
  });
});

describe("mapExeqNfseV1ToFocusNfsen", () => {
  it("município genérico inclui inscricao_municipal_prestador no payload", () => {
    const payload = mapExeqNfseV1ToFocusNfsen({
      ...baseDto,
      servico: { ...baseDto.servico, ibge_prestacao: "3507605" },
      regras_municipais: { enviar_inscricao_municipal_prestador: true },
    });

    expect(payload.inscricao_municipal_prestador).toBe("12345");
    const serialized = JSON.parse(JSON.stringify(payload));
    expect(serialized).toHaveProperty("inscricao_municipal_prestador", "12345");
  });

  it("Atibaia omite inscricao_municipal_prestador — JSON sem o campo (E0120)", () => {
    const payload = mapExeqNfseV1ToFocusNfsen({
      ...baseDto,
      prestador: { ...baseDto.prestador, inscricao_municipal: "64021" },
      regras_municipais: {
        enviar_inscricao_municipal_prestador: false,
        payload_flags: {
          endereco_tomador_fallback: {
            street: "Rua Dona Sinha",
            number: "100",
            district: "Centro",
            zip_code: "12940000",
          },
        },
      },
    });

    expect(payload.inscricao_municipal_prestador).toBeUndefined();
    const serialized = JSON.parse(JSON.stringify(payload));
    expect(serialized).not.toHaveProperty("inscricao_municipal_prestador");
    expect(Object.keys(serialized)).not.toContain("inscricao_municipal_prestador");
  });

  it("mapeia DTO para payload Focus NFS-e Nacional (plano)", () => {
    const payload = mapExeqNfseV1ToFocusNfsen({
      ...baseDto,
      regras_municipais: {
        enviar_inscricao_municipal_prestador: true,
        payload_flags: {
          endereco_tomador_fallback: {
            street: "Rua Dona Sinha",
            number: "100",
            district: "Centro",
            zip_code: "12940000",
          },
        },
      },
    });

    expect(payload).toMatchObject({
      cnpj_prestador: "11222333000181",
      inscricao_municipal_prestador: "12345",
      codigo_municipio_emissora: 3504107,
      codigo_municipio_prestacao: 3504107,
      cpf_tomador: "52998224725",
      razao_social_tomador: "Tomador Teste",
      codigo_tributacao_nacional_iss: "010101",
      descricao_servico: "Analise de sistemas",
      valor_servico: 1500,
      valor_iss: 30,
      codigo_opcao_simples_nacional: 3,
      regime_tributario_simples_nacional: 1,
      tipo_retencao_iss: 1,
      data_competencia: "2026-06-01",
      cep_tomador: "12940000",
      logradouro_tomador: "Rua Dona Sinha",
      situacao_tributaria_pis_cofins: "00",
    });
    expect(payload.data_emissao).toContain("2026-06-01T00:00:00-03:00");
    expect(payload.cnpj_tomador).toBeUndefined();
  });

  it("CNPJ tomador — CEP × IBGE coerente (evita E0240)", () => {
    const payload = mapExeqNfseV1ToFocusNfsen({
      ...baseDto,
      tomador: {
        documento: "11444777000161",
        nome: "Tomador Homologacao PJ",
        endereco: {
          street: "Rua Plinio da Silva Reis",
          number: "377",
          district: "Centro",
          zip_code: "14680000",
          ibge_code: "3524303",
        },
      },
      regras_municipais: { enviar_inscricao_municipal_prestador: false },
    });

    expect(payload).toMatchObject({
      cnpj_tomador: "11444777000161",
      cep_tomador: "14680000",
      codigo_municipio_tomador: 3524303,
      logradouro_tomador: "Rua Plinio da Silva Reis",
      numero_tomador: "377",
    });
  });
});
