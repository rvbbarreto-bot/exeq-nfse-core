import {
  type ChargeStatus,
  type GatewayIntegrationMode,
  inferGatewayIntegrationMode,
} from "@exeq/shared";

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: "Pendente",
  registered: "Registrada",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
  failed: "Falha",
};

export const FILTER_CHARGE_STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  ...(
    Object.entries(CHARGE_STATUS_LABELS) as [ChargeStatus, string][]
  ).map(([value, label]) => ({ label, value })),
];

export function formatChargeStatus(status: string): string {
  return CHARGE_STATUS_LABELS[status as ChargeStatus] ?? status;
}

export function chargeStatusClass(status: string): string {
  if (status === "paid") return "ok";
  if (status === "pending" || status === "registered") return "warn";
  if (status === "failed" || status === "cancelled" || status === "overdue") return "err";
  return "";
}

export function canCancelCharge(status: string): boolean {
  return status === "pending" || status === "registered";
}

export function canReprocessWebhookInbox(status: string): boolean {
  return status === "failed" || status === "received";
}

export function formatGatewayMode(
  mode: GatewayIntegrationMode | null | undefined,
  gatewayRef?: string | null,
): string | null {
  const resolved = mode ?? inferGatewayIntegrationMode(gatewayRef);
  if (!resolved) return null;
  return resolved === "mock" ? "Mock (sandbox local)" : "HTTP (gateway real)";
}

export function gatewayModeClass(mode: GatewayIntegrationMode | null | undefined): string {
  if (mode === "mock") return "warn";
  if (mode === "http") return "ok";
  return "";
}

/** URL mock de homolog (Sprint 20 — sem DNS obrigatório). */
export function isHomologMockSandboxUrl(url: string): boolean {
  return url.includes("sandbox.exeq.local");
}

export function buildChargesQuery(input: {
  status: string;
  correlation_id?: string;
  idempotency_key?: string;
  nf_issue_id?: string;
  limit?: string;
  cursor?: string;
}): Record<string, string> {
  const q: Record<string, string> = {};
  if (input.status) q.status = input.status;
  if (input.correlation_id?.trim()) q.correlation_id = input.correlation_id.trim();
  if (input.idempotency_key?.trim()) q.idempotency_key = input.idempotency_key.trim();
  if (input.nf_issue_id?.trim()) q.nf_issue_id = input.nf_issue_id.trim();
  if (input.limit) q.limit = input.limit;
  if (input.cursor) q.cursor = input.cursor;
  return q;
}

export function truncateId(id: string): string {
  return `${id.slice(0, 8)}…`;
}
