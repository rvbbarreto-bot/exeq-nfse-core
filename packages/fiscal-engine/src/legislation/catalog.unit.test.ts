import { describe, expect, it } from "vitest";
import {
  resolveLegislationByDate,
  getTransitionRatesForLegislation,
  computeTaxAmountCents,
} from "./catalog.js";

describe("legislation catalog", () => {
  it("resolveLegislationByDate retorna ISS legado antes de 2027", () => {
    const leg = resolveLegislationByDate("2026-06-15");
    expect(leg.code).toBe("LC214-2025-v1");
  });

  it("resolveLegislationByDate retorna TRANSITION-2027-v1 em 2027", () => {
    const leg = resolveLegislationByDate("2027-06-15");
    expect(leg.code).toBe("TRANSITION-2027-v1");
  });

  it("resolveLegislationByDate retorna TRANSITION-2029-v2 em 2030", () => {
    const leg = resolveLegislationByDate("2030-03-01");
    expect(leg.code).toBe("TRANSITION-2029-v2");
  });

  it("getTransitionRatesForLegislation aplica alíquotas sandbox", () => {
    const rates = getTransitionRatesForLegislation("TRANSITION-2027-v1");
    expect(rates.ibs_rate).toBe(0.001);
    expect(rates.cbs_rate).toBe(0.009);
  });

  it("computeTaxAmountCents arredonda corretamente", () => {
    expect(computeTaxAmountCents(10000, 0.02)).toBe(200);
    expect(computeTaxAmountCents(15000, 0.001)).toBe(15);
  });
});
