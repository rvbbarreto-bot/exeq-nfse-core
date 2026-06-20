import { describe, expect, it } from "vitest";
import { mapRuleRowToResolved } from "./tax-resolve.mapper.js";

describe("mapRuleRowToResolved", () => {
  it("mapeia Simples com codigo tributacao", () => {
    expect(
      mapRuleRowToResolved({
        iss_rate: "0.0200",
        iss_retained: false,
        irrf_rate: 0,
        pis_rate: 0,
        cofins_rate: 0,
        csll_rate: 0,
        simples_codigo_tributacao: 3,
      }),
    ).toEqual({
      iss_rate: 0.02,
      iss_retained: false,
      irrf_rate: 0,
      pis_rate: 0,
      cofins_rate: 0,
      csll_rate: 0,
      simples_codigo_tributacao: 3,
    });
  });

  it("mapeia Lucro Presumido sem simples", () => {
    expect(
      mapRuleRowToResolved({
        iss_rate: 0.02,
        iss_retained: false,
        irrf_rate: 0.015,
        pis_rate: 0.0065,
        cofins_rate: 0.03,
        csll_rate: 0.01,
        simples_codigo_tributacao: null,
      }),
    ).toEqual({
      iss_rate: 0.02,
      iss_retained: false,
      irrf_rate: 0.015,
      pis_rate: 0.0065,
      cofins_rate: 0.03,
      csll_rate: 0.01,
    });
  });
});
