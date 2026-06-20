import { describe, expect, it } from "vitest";
import { mapExeqNfseV1ToBethaRps } from "./betha-nfse.adapter.js";
import { assertBethaHomologMockOnly, buildBethaRpsXml } from "./betha-xml.builder.js";

const dto = {
  schema_version: "exeq.nfse.v1" as const,
  prestador: {
    cnpj: "37229907000137",
    razao_social: "EXEQ",
    regime_tributario: "simples_nacional" as const,
  },
  tomador: { documento: "11444777000161", nome: "Tomador" },
  servico: {
    codigo: "1.01",
    descricao: "Servico",
    ibge_prestacao: "3504107",
    valor_servico_cents: 10000,
    competencia: "2026-06-01",
  },
  tributacao: {
    iss_aliquota: 0.02,
    iss_retido: false,
    irrf_aliquota: 0,
    pis_aliquota: 0,
    cofins_aliquota: 0,
    csll_aliquota: 0,
  },
};

describe("buildBethaRpsXml", () => {
  it("gera XML RPS com campos essenciais", () => {
    const payload = mapExeqNfseV1ToBethaRps(dto, "exeq-123");
    const xml = buildBethaRpsXml(payload);
    expect(xml).toContain("<Numero>exeq-123</Numero>");
    expect(xml).toContain("<Cnpj>37229907000137</Cnpj>");
    expect(xml).toContain("<ValorServicos>100.00</ValorServicos>");
    expect(xml).toContain("<IssRetido>2</IssRetido>");
  });

  it("escapa caracteres XML", () => {
    const payload = mapExeqNfseV1ToBethaRps(
      {
        ...dto,
        servico: { ...dto.servico, descricao: "A & B <test>" },
      },
      "rps-1",
    );
    const xml = buildBethaRpsXml(payload);
    expect(xml).not.toContain("<test>");
  });
});

describe("assertBethaHomologMockOnly", () => {
  it("permite mock em homolog", () => {
    expect(() => assertBethaHomologMockOnly(true, false)).not.toThrow();
  });

  it("bloqueia SOAP real sem mock em homolog", () => {
    expect(() => assertBethaHomologMockOnly(false, true)).toThrow(
      "BETHA_SOAP_REAL_REQUIRES_PO_AUTHORIZATION",
    );
  });
});
