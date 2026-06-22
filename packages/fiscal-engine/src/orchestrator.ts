import { computeTaxAmountCents } from "./legislation/catalog.js";
import type {
  FiscalEngineInput,
  FiscalEngineKind,
  FiscalEngineOutput,
  LegacyIssInput,
  ResolvedTaxes,
} from "./types.js";

export function buildIssComponent(
  amountCents: number,
  legacy: LegacyIssInput,
  issRateMultiplier = 1,
): ResolvedTaxes["iss"] {
  const rate = legacy.iss_rate * issRateMultiplier;
  return {
    base_cents: amountCents,
    rate,
    amount_cents: computeTaxAmountCents(amountCents, rate),
    retained: legacy.iss_retained,
    irrf_rate: legacy.irrf_rate,
    pis_rate: legacy.pis_rate,
    cofins_rate: legacy.cofins_rate,
    csll_rate: legacy.csll_rate,
    simples_codigo_tributacao: legacy.simples_codigo_tributacao ?? null,
  };
}

export function computeLegacyIssOnly(input: FiscalEngineInput): FiscalEngineOutput {
  return {
    engine: "iss_legacy",
    legislation_code: input.legislation.code,
    resolved_taxes: {
      iss: buildIssComponent(input.amount_cents, input.legacy_iss),
    },
    future_taxes: {},
  };
}

export function computeTransitionHybrid(input: FiscalEngineInput): FiscalEngineOutput {
  const rates = input.transition_rates;
  const iss = buildIssComponent(
    input.amount_cents,
    input.legacy_iss,
    rates.iss_rate_multiplier ?? 1,
  );

  const resolved: ResolvedTaxes = { iss };

  if (input.flags.ibs && rates.ibs_rate > 0) {
    resolved.ibs = {
      base_cents: input.amount_cents,
      rate: rates.ibs_rate,
      amount_cents: computeTaxAmountCents(input.amount_cents, rates.ibs_rate),
      cst: "TBD",
      note: "Sandbox LC214 — aguarda catálogo IBS oficial",
    };
  }

  if (input.flags.cbs && rates.cbs_rate > 0) {
    resolved.cbs = {
      base_cents: input.amount_cents,
      rate: rates.cbs_rate,
      amount_cents: computeTaxAmountCents(input.amount_cents, rates.cbs_rate),
      cst: "TBD",
      note: "Sandbox LC214 — aguarda catálogo CBS oficial",
    };
  }

  return {
    engine: "hybrid",
    legislation_code: input.legislation.code,
    resolved_taxes: resolved,
    future_taxes: {},
  };
}

export function computeIbsCbsOnly(input: FiscalEngineInput): FiscalEngineOutput {
  const rates = input.transition_rates;
  const resolved: ResolvedTaxes = {
    iss: buildIssComponent(input.amount_cents, {
      ...input.legacy_iss,
      iss_rate: 0,
    }),
  };

  if (input.flags.ibs && rates.ibs_rate > 0) {
    resolved.ibs = {
      base_cents: input.amount_cents,
      rate: rates.ibs_rate,
      amount_cents: computeTaxAmountCents(input.amount_cents, rates.ibs_rate),
      cst: "TBD",
    };
  }

  if (input.flags.cbs && rates.cbs_rate > 0) {
    resolved.cbs = {
      base_cents: input.amount_cents,
      rate: rates.cbs_rate,
      amount_cents: computeTaxAmountCents(input.amount_cents, rates.cbs_rate),
      cst: "TBD",
    };
  }

  return {
    engine: "ibs_cbs_v1",
    legislation_code: input.legislation.code,
    resolved_taxes: resolved,
    future_taxes: { iss_sunset: true },
  };
}

export function selectEngineKind(
  competenceDate: string,
  flags: FiscalEngineInput["flags"],
): FiscalEngineKind {
  if (competenceDate < "2027-01-01") return "iss_legacy";

  if (flags.transitionMode && (flags.ibs || flags.cbs)) return "hybrid";
  if (flags.ibs && flags.cbs) return "ibs_cbs_v1";
  return "iss_legacy";
}

export function runFiscalEngine(input: FiscalEngineInput): FiscalEngineOutput {
  const kind = selectEngineKind(input.competence_date, input.flags);

  switch (kind) {
    case "hybrid":
      return computeTransitionHybrid(input);
    case "ibs_cbs_v1":
      return computeIbsCbsOnly(input);
    default:
      return computeLegacyIssOnly(input);
  }
}

export function toPreviewBreakdown(output: FiscalEngineOutput): import("./types.js").FiscalPreviewBreakdown {
  const { iss, ibs, cbs } = output.resolved_taxes;
  return {
    iss_rate: iss.rate,
    iss_amount_cents: iss.amount_cents,
    iss_retained: iss.retained,
    irrf_rate: iss.irrf_rate,
    pis_rate: iss.pis_rate,
    cofins_rate: iss.cofins_rate,
    csll_rate: iss.csll_rate,
    ibs: ibs
      ? { rate: ibs.rate, amount_cents: ibs.amount_cents, note: ibs.note }
      : undefined,
    cbs: cbs
      ? { rate: cbs.rate, amount_cents: cbs.amount_cents, note: cbs.note }
      : undefined,
  };
}
