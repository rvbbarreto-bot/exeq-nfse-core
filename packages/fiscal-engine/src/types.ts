export type FiscalEngineKind = "iss_legacy" | "hybrid" | "ibs_cbs_v1";

export type FiscalFeatureFlags = {
  transitionMode: boolean;
  ibs: boolean;
  cbs: boolean;
};

/** ISS legado já resolvido pelo catálogo municipal (TaxResolveResponse.resolved). */
export type LegacyIssInput = {
  iss_rate: number;
  iss_retained: boolean;
  irrf_rate: number;
  pis_rate: number;
  cofins_rate: number;
  csll_rate: number;
  simples_codigo_tributacao?: number | null;
};

export type TaxLineItem = {
  base_cents: number;
  rate: number;
  amount_cents: number;
  cst?: string;
  note?: string;
};

export type ResolvedTaxes = {
  iss: TaxLineItem & {
    retained: boolean;
    irrf_rate: number;
    pis_rate: number;
    cofins_rate: number;
    csll_rate: number;
    simples_codigo_tributacao?: number | null;
  };
  ibs?: TaxLineItem;
  cbs?: TaxLineItem;
};

export type LegislationVersion = {
  code: string;
  title: string;
  valid_from: string;
  valid_to: string | null;
};

export type TransitionRates = {
  ibs_rate: number;
  cbs_rate: number;
  /** Multiplicador sandbox sobre alíquota ISS legado (1 = intacto). */
  iss_rate_multiplier?: number;
};

export type FiscalEngineInput = {
  amount_cents: number;
  competence_date: string;
  ibge_code: string;
  service_code: string;
  legacy_iss: LegacyIssInput;
  flags: FiscalFeatureFlags;
  legislation: LegislationVersion;
  transition_rates: TransitionRates;
};

export type FiscalEngineOutput = {
  engine: FiscalEngineKind;
  legislation_code: string;
  resolved_taxes: ResolvedTaxes;
  future_taxes: Record<string, unknown>;
};

export type FiscalPreviewBreakdown = {
  iss_rate: number;
  iss_amount_cents: number;
  iss_retained: boolean;
  irrf_rate: number;
  pis_rate: number;
  cofins_rate: number;
  csll_rate: number;
  ibs?: { rate: number; amount_cents: number; note?: string };
  cbs?: { rate: number; amount_cents: number; note?: string };
};
