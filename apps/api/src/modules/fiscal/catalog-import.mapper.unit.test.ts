import { describe, expect, it } from "vitest";
import { mapCsvRowsToRules } from "./catalog-import.mapper.js";

describe("mapCsvRowsToRules", () => {
  const profiles = [{ id: "11111111-1111-4111-8111-111111111111", name: "Perfil Piloto SP" }];

  it("mapeia linha CSV para input de regra", () => {
    const { rules, errors } = mapCsvRowsToRules(
      [
        {
          fiscal_profile_name: "Perfil Piloto SP",
          ibge_code: "3504107",
          municipio_nome: "Atibaia",
          uf: "SP",
          service_code: "1.01",
          service_description: "Analise",
          tax_regime: "simples_nacional",
          iss_rate: 0.02,
          iss_retained: false,
          irrf_rate: 0,
          pis_rate: 0,
          cofins_rate: 0,
          csll_rate: 0,
          simples_codigo_tributacao: 3,
          valid_from: "2026-06-01",
          priority: 100,
        },
      ],
      profiles,
    );
    expect(errors).toHaveLength(0);
    expect(rules[0]!.fiscal_profile_id).toBe(profiles[0]!.id);
  });

  it("reporta perfil fiscal ausente", () => {
    const { rules, errors } = mapCsvRowsToRules(
      [
        {
          fiscal_profile_name: "Inexistente",
          ibge_code: "3504107",
          municipio_nome: "Atibaia",
          uf: "SP",
          service_code: "1.01",
          service_description: "Analise",
          tax_regime: "simples_nacional",
          iss_rate: 0.02,
          iss_retained: false,
          irrf_rate: 0,
          pis_rate: 0,
          cofins_rate: 0,
          csll_rate: 0,
          simples_codigo_tributacao: 3,
          valid_from: "2026-06-01",
          priority: 100,
        },
      ],
      profiles,
    );
    expect(rules).toHaveLength(0);
    expect(errors[0]!.message).toContain("Perfil fiscal");
  });
});
