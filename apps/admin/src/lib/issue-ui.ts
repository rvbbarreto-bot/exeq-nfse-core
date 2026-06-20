export type NfIssueStatus =
  | "draft"
  | "pending_tax"
  | "queued"
  | "submitting"
  | "polling"
  | "authorized"
  | "rejected"
  | "cancelled"
  | "failed";

export const ISSUE_STATUS_LABELS: Record<NfIssueStatus, string> = {
  draft: "Rascunho",
  pending_tax: "Resolvendo impostos",
  queued: "Na fila",
  submitting: "Enviando Focus",
  polling: "Aguardando prefeitura",
  authorized: "Autorizada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  failed: "Falha",
};

export const ISSUE_STATUS_CLASS: Record<NfIssueStatus, string> = {
  draft: "status-neutral",
  pending_tax: "status-progress",
  queued: "status-progress",
  submitting: "status-progress",
  polling: "status-progress",
  authorized: "status-ok",
  rejected: "status-error",
  cancelled: "status-neutral",
  failed: "status-error",
};

import { PILOT_MUNICIPIOS } from "@exeq/shared";

export { PILOT_MUNICIPIOS };

export const FILTER_STATUS_OPTIONS: { value: "" | NfIssueStatus; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "authorized", label: ISSUE_STATUS_LABELS.authorized },
  { value: "rejected", label: ISSUE_STATUS_LABELS.rejected },
  { value: "failed", label: ISSUE_STATUS_LABELS.failed },
  { value: "polling", label: ISSUE_STATUS_LABELS.polling },
  { value: "cancelled", label: ISSUE_STATUS_LABELS.cancelled },
];

export function formatIssueStatus(status: string): string {
  return ISSUE_STATUS_LABELS[status as NfIssueStatus] ?? status;
}

export function issueStatusClass(status: string): string {
  return ISSUE_STATUS_CLASS[status as NfIssueStatus] ?? "status-neutral";
}

export function formatAmountCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatMunicipio(ibgeCode: string): string {
  const found = PILOT_MUNICIPIOS.find((m) => m.ibge_code === ibgeCode);
  return found ? `${found.label} (${ibgeCode})` : ibgeCode;
}

export function canCancelIssue(status: string): boolean {
  return status === "authorized";
}

export function canReprocessIssue(status: string): boolean {
  return status === "failed";
}

export function buildIssuesQuery(params: {
  status: string;
  ibge_code: string;
  from_date: string;
  to_date: string;
  correlation_id?: string;
  idempotency_key?: string;
  cursor?: string;
}): Record<string, string> {
  const q: Record<string, string> = {};
  if (params.status) q.status = params.status;
  if (params.ibge_code) q.ibge_code = params.ibge_code;
  if (params.from_date) q.from_date = params.from_date;
  if (params.to_date) q.to_date = params.to_date;
  if (params.correlation_id?.trim()) q.correlation_id = params.correlation_id.trim();
  if (params.idempotency_key?.trim()) q.idempotency_key = params.idempotency_key.trim();
  if (params.cursor) q.cursor = params.cursor;
  q.limit = "50";
  return q;
}
