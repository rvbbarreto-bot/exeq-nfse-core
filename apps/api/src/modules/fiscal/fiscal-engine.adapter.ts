import type { TaxResolveResponse } from "@exeq/shared";
import { buildSplitPaymentV1, type SplitPaymentV1 } from "@exeq/shared";
import {
  runFiscalEngine,
  selectEngineKind,
  toPreviewBreakdown,
  type FiscalEngineOutput,
  type FiscalFeatureFlags,
  type FiscalPreviewBreakdown,
} from "@exeq/fiscal-engine";
import type { Sql } from "../../db/client.js";
import { isFeatureEnabled } from "./feature-flags.service.js";
import {
  loadTransitionRates,
  resolveLegislationForCompetence,
} from "./legislation.service.js";

export async function loadFiscalFeatureFlags(
  db: Sql,
  tenantId: string,
): Promise<FiscalFeatureFlags> {
  const [transitionMode, ibs, cbs] = await Promise.all([
    isFeatureEnabled(db, tenantId, "FEATURE_TRANSITION_MODE"),
    isFeatureEnabled(db, tenantId, "FEATURE_IBS"),
    isFeatureEnabled(db, tenantId, "FEATURE_CBS"),
  ]);
  return { transitionMode, ibs, cbs };
}

export type ComputeFiscalTaxInput = {
  tenantId: string;
  amount_cents: number;
  competence_date: string;
  ibge_code: string;
  service_code: string;
  tax: TaxResolveResponse;
};

export async function computeFiscalTaxes(
  db: Sql,
  input: ComputeFiscalTaxInput,
): Promise<FiscalEngineOutput> {
  const flags = await loadFiscalFeatureFlags(db, input.tenantId);
  const legislation = await resolveLegislationForCompetence(db, input.competence_date);
  const transition_rates = await loadTransitionRates(db, legislation.code);

  return runFiscalEngine({
    amount_cents: input.amount_cents,
    competence_date: input.competence_date,
    ibge_code: input.ibge_code,
    service_code: input.service_code,
    legacy_iss: {
      iss_rate: input.tax.resolved.iss_rate,
      iss_retained: input.tax.resolved.iss_retained,
      irrf_rate: input.tax.resolved.irrf_rate,
      pis_rate: input.tax.resolved.pis_rate,
      cofins_rate: input.tax.resolved.cofins_rate,
      csll_rate: input.tax.resolved.csll_rate,
      simples_codigo_tributacao: input.tax.resolved.simples_codigo_tributacao,
    },
    flags,
    legislation,
    transition_rates,
  });
}

export async function computeFiscalPreviewBreakdown(
  db: Sql,
  input: ComputeFiscalTaxInput,
): Promise<{ engine: FiscalEngineOutput["engine"]; tax_breakdown: FiscalPreviewBreakdown }> {
  const result = await computeFiscalTaxes(db, input);
  return {
    engine: result.engine,
    tax_breakdown: toPreviewBreakdown(result),
  };
}

/** Espelha resolveFiscalEngine — útil para testes sem DB mock de flags. */
export function resolveEngineFromFlags(
  competenceDate: string,
  flags: FiscalFeatureFlags,
): FiscalEngineOutput["engine"] {
  return selectEngineKind(competenceDate, flags);
}

export function fiscalEngineResultToSnapshotTaxes(
  result: FiscalEngineOutput,
  tax: TaxResolveResponse,
): Record<string, unknown> {
  const { iss, ibs, cbs } = result.resolved_taxes;
  return {
    iss: {
      rate: iss.rate,
      amount_cents: iss.amount_cents,
      retained: iss.retained,
      irrf_rate: iss.irrf_rate,
      pis_rate: iss.pis_rate,
      cofins_rate: iss.cofins_rate,
      csll_rate: iss.csll_rate,
      simples_codigo_tributacao: iss.simples_codigo_tributacao ?? null,
    },
    ibs: ibs
      ? { rate: ibs.rate, amount_cents: ibs.amount_cents, cst: ibs.cst ?? "TBD" }
      : undefined,
    cbs: cbs
      ? { rate: cbs.rate, amount_cents: cbs.amount_cents, cst: cbs.cst ?? "TBD" }
      : undefined,
    rule_id: tax.rule_id,
    catalog_version: tax.catalog_version,
    service_code: tax.service_code,
    tax_regime: tax.tax_regime,
  };
}

export function buildSplitPaymentFromEngine(
  result: FiscalEngineOutput,
  municipioDestinoIbge: string,
): SplitPaymentV1 {
  const { iss, ibs, cbs } = result.resolved_taxes;
  return buildSplitPaymentV1({
    engine: result.engine,
    municipio_destino_ibge: municipioDestinoIbge,
    resolved_taxes: {
      iss: { rate: iss.rate, amount_cents: iss.amount_cents },
      ibs: ibs ? { rate: ibs.rate, amount_cents: ibs.amount_cents } : undefined,
      cbs: cbs ? { rate: cbs.rate, amount_cents: cbs.amount_cents } : undefined,
    },
  });
}
