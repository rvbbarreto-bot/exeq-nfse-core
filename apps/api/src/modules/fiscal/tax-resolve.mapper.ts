import type { ResolvedTaxParams } from "@exeq/shared";

export type RuleRatesRow = {
  iss_rate: string | number;
  iss_retained: boolean;
  irrf_rate: string | number;
  pis_rate: string | number;
  cofins_rate: string | number;
  csll_rate: string | number;
  simples_codigo_tributacao: number | null;
};

/** Maps DB row to resolved tax params (pure — unit tested). */
export function mapRuleRowToResolved(row: RuleRatesRow): ResolvedTaxParams {
  const resolved: ResolvedTaxParams = {
    iss_rate: Number(row.iss_rate),
    iss_retained: row.iss_retained,
    irrf_rate: Number(row.irrf_rate),
    pis_rate: Number(row.pis_rate),
    cofins_rate: Number(row.cofins_rate),
    csll_rate: Number(row.csll_rate),
  };
  if (row.simples_codigo_tributacao != null) {
    resolved.simples_codigo_tributacao = row.simples_codigo_tributacao;
  }
  return resolved;
}
