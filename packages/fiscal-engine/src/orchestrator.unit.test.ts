import { describe, expect, it } from "vitest";
import {
  runFiscalEngine,
  selectEngineKind,
  toPreviewBreakdown,
} from "./orchestrator.js";
import type { FiscalEngineInput } from "./types.js";

const baseInput: FiscalEngineInput = {
  amount_cents: 10000,
  competence_date: "2027-06-15",
  ibge_code: "3504107",
  service_code: "1.01",
  legacy_iss: {
    iss_rate: 0.02,
    iss_retained: false,
    irrf_rate: 0,
    pis_rate: 0,
    cofins_rate: 0,
    csll_rate: 0,
  },
  flags: {
    transitionMode: true,
    ibs: true,
    cbs: true,
  },
  legislation: {
    code: "TRANSITION-2027-v1",
    title: "Transição 2027",
    valid_from: "2027-01-01",
    valid_to: "2029-12-31",
  },
  transition_rates: {
    ibs_rate: 0.001,
    cbs_rate: 0.009,
    iss_rate_multiplier: 1,
  },
};

describe("FiscalOrchestrator", () => {
  it("cenário 1 — ISS only 2026 (baseline P0)", () => {
    const result = runFiscalEngine({
      ...baseInput,
      competence_date: "2026-06-15",
      flags: { transitionMode: false, ibs: false, cbs: false },
      legislation: {
        code: "LC214-2025-v1",
        title: "LC214",
        valid_from: "2025-01-01",
        valid_to: null,
      },
    });

    expect(result.engine).toBe("iss_legacy");
    expect(result.resolved_taxes.iss.amount_cents).toBe(200);
    expect(result.resolved_taxes.ibs).toBeUndefined();
    expect(result.resolved_taxes.cbs).toBeUndefined();
  });

  it("cenário 2 — híbrido 2027 com ISS + IBS + CBS", () => {
    const result = runFiscalEngine(baseInput);

    expect(result.engine).toBe("hybrid");
    expect(result.legislation_code).toBe("TRANSITION-2027-v1");
    expect(result.resolved_taxes.iss.amount_cents).toBe(200);
    expect(result.resolved_taxes.ibs?.amount_cents).toBe(10);
    expect(result.resolved_taxes.cbs?.amount_cents).toBe(90);
  });

  it("cenário 6 — transition flag off ignora IBS mesmo em 2027", () => {
    const result = runFiscalEngine({
      ...baseInput,
      flags: { transitionMode: false, ibs: false, cbs: false },
    });

    expect(result.engine).toBe("iss_legacy");
    expect(result.resolved_taxes.ibs).toBeUndefined();
  });

  it("ibs_cbs_v1 quando IBS+CBS sem transition mode", () => {
    expect(
      selectEngineKind("2027-06-15", {
        transitionMode: false,
        ibs: true,
        cbs: true,
      }),
    ).toBe("ibs_cbs_v1");

    const result = runFiscalEngine({
      ...baseInput,
      flags: { transitionMode: false, ibs: true, cbs: true },
    });
    expect(result.engine).toBe("ibs_cbs_v1");
    expect(result.resolved_taxes.iss.amount_cents).toBe(0);
    expect(result.resolved_taxes.ibs?.amount_cents).toBe(10);
  });

  it("cenário 3 — 2030 ISS reduzido via multiplier", () => {
    const result = runFiscalEngine({
      ...baseInput,
      competence_date: "2030-03-01",
      legislation: {
        code: "TRANSITION-2029-v2",
        title: "Transição 2029",
        valid_from: "2030-01-01",
        valid_to: "2032-12-31",
      },
      transition_rates: {
        ibs_rate: 0.005,
        cbs_rate: 0.009,
        iss_rate_multiplier: 0.5,
      },
    });

    expect(result.resolved_taxes.iss.amount_cents).toBe(100);
    expect(result.resolved_taxes.ibs?.amount_cents).toBe(50);
  });

  it("toPreviewBreakdown mapeia breakdown para API", () => {
    const result = runFiscalEngine(baseInput);
    const breakdown = toPreviewBreakdown(result);

    expect(breakdown.iss_amount_cents).toBe(200);
    expect(breakdown.ibs?.amount_cents).toBe(10);
    expect(breakdown.cbs?.amount_cents).toBe(90);
  });
});
