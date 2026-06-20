import type { WebhookInboxStatus } from "@exeq/shared";

export const WEBHOOK_STATUS_LABELS: Record<WebhookInboxStatus, string> = {
  received: "Recebido",
  processing: "Processando",
  processed: "Processado",
  failed: "Falha",
};

export const FILTER_WEBHOOK_STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Falha", value: "failed" },
  { label: "Recebido", value: "received" },
  { label: "Processando", value: "processing" },
  { label: "Processado", value: "processed" },
];

export function formatWebhookStatus(status: string): string {
  return WEBHOOK_STATUS_LABELS[status as WebhookInboxStatus] ?? status;
}

export function webhookStatusClass(status: string): string {
  if (status === "processed") return "ok";
  if (status === "processing" || status === "received") return "warn";
  if (status === "failed") return "err";
  return "";
}

export { canReprocessWebhookInbox } from "./charge-ui.js";

export function buildWebhooksQuery(input: {
  status: string;
  idempotency_key?: string;
  limit?: string;
  cursor?: string;
}): Record<string, string> {
  const q: Record<string, string> = {};
  if (input.status) q.status = input.status;
  if (input.idempotency_key?.trim()) q.idempotency_key = input.idempotency_key.trim();
  q.limit = input.limit ?? "50";
  if (input.cursor) q.cursor = input.cursor;
  return q;
}
