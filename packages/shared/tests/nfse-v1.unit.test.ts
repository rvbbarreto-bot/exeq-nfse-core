import { describe, expect, it } from "vitest";
import { exeqNfseV1Schema } from "../src/nfse-v1.js";

describe("exeqNfseV1Schema", () => {
  it("valida DTO minimo", () => {
    const parsed = exeqNfseV1Schema.safeParse({
      schema_version: "exeq.nfse.v1",
      prestador: {
        cnpj: "11222333000181",
        razao_social: "Prestador LTDA",
        regime_tributario: "simples_nacional",
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
    });
    expect(parsed.success).toBe(true);
  });
});
