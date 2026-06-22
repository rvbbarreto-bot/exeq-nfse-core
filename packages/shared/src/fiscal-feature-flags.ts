export const FISCAL_FEATURE_FLAG_KEYS = [
  "FEATURE_IBS",
  "FEATURE_CBS",
  "FEATURE_PREVIEW_TAX",
  "FEATURE_ACCOUNTANT_PORTAL",
  "FEATURE_TRANSITION_MODE",
] as const;

export type FiscalFeatureFlagKey = (typeof FISCAL_FEATURE_FLAG_KEYS)[number];

export const FISCAL_FEATURE_FLAG_LABELS: Record<FiscalFeatureFlagKey, string> = {
  FEATURE_IBS: "Cálculo IBS (Reforma Tributária)",
  FEATURE_CBS: "Cálculo CBS (Reforma Tributária)",
  FEATURE_PREVIEW_TAX: "Preview tributário antes da emissão",
  FEATURE_ACCOUNTANT_PORTAL: "Portal do contador (RBAC)",
  FEATURE_TRANSITION_MODE: "Motor híbrido ISS + IBS/CBS (transição)",
};

export function isFiscalFeatureFlagKey(value: string): value is FiscalFeatureFlagKey {
  return (FISCAL_FEATURE_FLAG_KEYS as readonly string[]).includes(value);
}
