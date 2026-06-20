import { describe, expect, it } from "vitest";
import {
  assertFocusPrevalidate,
  FocusPrevalidateError,
  prevalidateExeqNfseV1ForFocus,
} from "../src/focus-prevalidate.js";

const validDto = {
  schema_version: "exeq.nfse.v1" as const,
  prestador: {
    cnpj: "11222333000181",
    razao_social: "Prestador LTDA",
    regime_tributario: "simples_nacional" as const,
  },
  tomador: { documento: "52998224725", nome: "Tomador" },
  servico: {
    codigo: "1.01",
    descricao: "Analise de sistemas",
    ibge_prestacao: "3504107",
    valor_servico_cents: 100000,
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

describe("focus-prevalidate", () => {
  it("aceita DTO piloto valido", () => {
    expect(() => assertFocusPrevalidate(validDto)).not.toThrow();
  });

  it("rejeita Barueri fora do escopo operacional PO (3 municípios)", () => {
    const issues = prevalidateExeqNfseV1ForFocus({
      ...validDto,
      servico: { ...validDto.servico, ibge_prestacao: "3505708" },
    });
    expect(issues.some((i) => i.code === "MUNICIPIO_NAO_HOMOLOGADO")).toBe(true);
  });

  it("rejeita municipio fora do piloto", () => {
    const issues = prevalidateExeqNfseV1ForFocus({
      ...validDto,
      servico: { ...validDto.servico, ibge_prestacao: "3550308" },
    });
    expect(issues.some((i) => i.code === "MUNICIPIO_NAO_HOMOLOGADO")).toBe(true);
  });

  it("rejeita Simples sem codigo tributacao", () => {
    expect(() =>
      assertFocusPrevalidate({
        ...validDto,
        tributacao: { ...validDto.tributacao, simples_codigo_tributacao: undefined },
      }),
    ).toThrow(FocusPrevalidateError);
  });
});
