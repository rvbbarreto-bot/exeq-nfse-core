import type { FastifyBaseLogger } from "fastify";
import type { FiscalFeatureFlagKey } from "@exeq/shared";

export type FiscalDomainEvent =
  | "TaxRuleResolved"
  | "TaxRuleNotFound"
  | "CatalogPublished"
  | "CatalogRolledBack"
  | "TaxPreviewFailed"
  | "ProviderRejected"
  | "TaxSnapshotCreated";

type TelemetryAttrs = Record<string, string | number | boolean | null | undefined>;

let defaultLogger: FastifyBaseLogger | null = null;

export function setFiscalTelemetryLogger(logger: FastifyBaseLogger): void {
  defaultLogger = logger;
}

function emit(event: FiscalDomainEvent, attrs: TelemetryAttrs): void {
  const payload = {
    event,
    domain: "fiscal",
    ts: new Date().toISOString(),
    ...attrs,
  };
  if (defaultLogger) {
    defaultLogger.info(payload, `fiscal.${event}`);
  } else if (process.env.NODE_ENV !== "test") {
    console.info(JSON.stringify(payload));
  }
}

export function emitTaxRuleResolved(attrs: {
  tenant_id: string;
  ibge_code: string;
  service_code: string;
  catalog_version: number;
  rule_id: string;
  trace_id?: string;
}): void {
  emit("TaxRuleResolved", attrs);
}

export function emitTaxRuleNotFound(attrs: {
  tenant_id: string;
  ibge_code: string;
  service_code: string;
  tax_regime: string;
  competence_date: string;
  trace_id?: string;
}): void {
  emit("TaxRuleNotFound", attrs);
}

export function emitCatalogPublished(attrs: {
  tenant_id: string;
  catalog_id: string;
  catalog_version: number;
  published_by?: string;
}): void {
  emit("CatalogPublished", attrs);
}

export function emitCatalogRolledBack(attrs: {
  tenant_id: string;
  catalog_id: string;
  from_version: number;
  to_version: number;
}): void {
  emit("CatalogRolledBack", attrs);
}

export function emitTaxPreviewFailed(attrs: {
  tenant_id: string;
  error: string;
}): void {
  emit("TaxPreviewFailed", attrs);
}

export function emitProviderRejected(attrs: {
  tenant_id: string;
  nf_issue_id: string;
  provider: string;
  error_code?: string;
  trace_id?: string;
}): void {
  emit("ProviderRejected", attrs);
}

export function emitTaxSnapshotCreated(attrs: {
  tenant_id: string;
  tax_snapshot_id: string;
  nf_issue_id: string;
  engine: string;
  payload_hash: string;
}): void {
  emit("TaxSnapshotCreated", attrs);
}

export function emitFeatureFlagChecked(attrs: {
  tenant_id: string;
  flag: FiscalFeatureFlagKey;
  enabled: boolean;
}): void {
  // Auxiliar Sprint 0 — não é evento RFC obrigatório
  if (process.env.FISCAL_TELEMETRY_VERBOSE === "true") {
    emit("TaxRuleResolved", { ...attrs, note: "feature_flag_check" });
  }
}
