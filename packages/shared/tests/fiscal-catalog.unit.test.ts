import { describe, expect, it } from "vitest";
import { createMunicipalTaxRuleSchema } from "../src/fiscal-catalog.js";

describe("createMunicipalTaxRuleSchema", () => {
  const base = {
    fiscal_profile_id: "11111111-1111-4111-8111-111111111111",
    ibge_code: "3504107",
    municipio_nome: "Atibaia",
    uf: "SP",
    service_code: "1.01",
    service_description: "Analise",
    tax_regime: "simples_nacional" as const,
    iss_rate: 0.02,
    iss_retained: false,
    valid_from: "2026-06-01",
  };

  it("exige codigo Simples", () => {
    const parsed = createMunicipalTaxRuleSchema.safeParse(base);
    expect(parsed.success).toBe(false);
  });

  it("aceita regra Simples completa", () => {
    const parsed = createMunicipalTaxRuleSchema.safeParse({
      ...base,
      simples_codigo_tributacao: 3,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita valid_to anterior a valid_from", () => {
    const parsed = createMunicipalTaxRuleSchema.safeParse({
      ...base,
      simples_codigo_tributacao: 3,
      valid_to: "2026-05-01",
    });
    expect(parsed.success).toBe(false);
  });
});
