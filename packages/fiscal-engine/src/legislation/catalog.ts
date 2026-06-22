import type { LegislationVersion, TransitionRates } from "../types.js";

/** Catálogo in-memory LC 214 sandbox — espelha seeds migration 0020. */
export const SANDBOX_LEGISLATION: LegislationVersion[] = [
  {
    code: "LC214-2025-v1",
    title: "Lei Complementar 214/2025 — IBS/CBS (referência)",
    valid_from: "2025-01-01",
    valid_to: null,
  },
  {
    code: "TRANSITION-2027-v1",
    title: "Transição IBS/CBS — fase teste 2027",
    valid_from: "2027-01-01",
    valid_to: "2029-12-31",
  },
  {
    code: "TRANSITION-2029-v2",
    title: "Transição IBS/CBS — fase redução ISS 2030+",
    valid_from: "2030-01-01",
    valid_to: "2032-12-31",
  },
];

export const SANDBOX_TRANSITION_RATES: Record<string, TransitionRates> = {
  "TRANSITION-2027-v1": {
    ibs_rate: 0.001,
    cbs_rate: 0.009,
    iss_rate_multiplier: 1,
  },
  "TRANSITION-2029-v2": {
    ibs_rate: 0.005,
    cbs_rate: 0.009,
    iss_rate_multiplier: 0.5,
  },
  "LC214-2025-v1": {
    ibs_rate: 0,
    cbs_rate: 0,
    iss_rate_multiplier: 1,
  },
};

export function resolveLegislationByDate(
  competenceDate: string,
  catalog: LegislationVersion[] = SANDBOX_LEGISLATION,
): LegislationVersion {
  const matching = catalog
    .filter(
      (v) =>
        competenceDate >= v.valid_from &&
        (v.valid_to === null || competenceDate <= v.valid_to),
    )
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  if (matching.length === 0) {
    return {
      code: "ISS-LEGACY-v1",
      title: "ISS municipal legado",
      valid_from: "1900-01-01",
      valid_to: null,
    };
  }

  const transition = matching.find((v) => v.code.startsWith("TRANSITION-"));
  if (transition && competenceDate >= "2027-01-01") {
    return transition;
  }

  return matching[0]!;
}

export function getTransitionRatesForLegislation(
  legislationCode: string,
  overrides?: Partial<TransitionRates>,
): TransitionRates {
  const base = SANDBOX_TRANSITION_RATES[legislationCode] ?? {
    ibs_rate: 0,
    cbs_rate: 0,
    iss_rate_multiplier: 1,
  };
  return { ...base, ...overrides };
}

export function computeTaxAmountCents(baseCents: number, rate: number): number {
  return Math.round(baseCents * rate);
}
