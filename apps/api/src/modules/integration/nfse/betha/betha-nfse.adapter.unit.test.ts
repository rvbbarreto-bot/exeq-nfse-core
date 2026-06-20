import { describe, expect, it } from "vitest";
import { mapExeqNfseV1ToBethaRps } from "./betha-nfse.adapter.js";

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

describe("mapExeqNfseV1ToBethaRps", () => {
  it("mapeia campos basicos do RPS", () => {
    const rps = mapExeqNfseV1ToBethaRps(dto, "exeq-123");
    expect(rps.rps.prestador_cnpj).toBe("37229907000137");
    expect(rps.rps.valor_servicos).toBe(100);
    expect(rps.rps.numero).toBe("exeq-123");
  });
});
