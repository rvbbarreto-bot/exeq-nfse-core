import type { ChargeListItem } from "../api/client.js";

const INACTIVE_CHARGE_STATUSES = new Set(["cancelled", "failed"]);

export function hasActiveLinkedCharge(charges: Pick<ChargeListItem, "status">[]): boolean {
  return charges.some((c) => !INACTIVE_CHARGE_STATUSES.has(c.status));
}

/** Data de vencimento padrão: +30 dias (YYYY-MM-DD). */
export function defaultChargeDueDate(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function buildLinkedChargeIdempotencyKey(issueId: string): string {
  const slug = issueId.replace(/-/g, "").slice(0, 12);
  const nonce = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `admin-issue-${slug}-${Date.now()}-${nonce}`;
}
