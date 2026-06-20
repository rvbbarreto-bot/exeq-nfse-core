import type { ChargeStatus, CreateChargeRequest, ListChargesQuery } from "@exeq/shared";
import { assertChargeTransition, InvalidChargeTransitionError } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { NotFoundError } from "../master-data/master-data.service.js";
import { appendAuditLog } from "../issuance/nf-issue.service.js";
import { inferGatewayIntegrationMode } from "@exeq/shared";
import { resolveGatewaySandboxUrl } from "../integration/gateway/payment-gateway.client.js";
import { rowsToCsv } from "../../lib/csv.js";
import { sha256Hex } from "../../lib/hash.js";

export class DuplicateChargeIdempotencyError extends Error {
  readonly chargeId: string;

  constructor(chargeId: string) {
    super("DUPLICATE_CHARGE_IDEMPOTENCY_KEY");
    this.name = "DuplicateChargeIdempotencyError";
    this.chargeId = chargeId;
  }
}

export class ChargeNotCancellableError extends Error {
  constructor(readonly status: ChargeStatus) {
    super("CHARGE_NOT_CANCELLABLE");
    this.name = "ChargeNotCancellableError";
  }
}

export class ChargeNfIssueAlreadyLinkedError extends Error {
  constructor(readonly chargeId: string) {
    super("NF_ISSUE_ALREADY_LINKED");
    this.name = "ChargeNfIssueAlreadyLinkedError";
  }
}

type ChargeRow = {
  id: string;
  status: ChargeStatus;
  idempotency_key: string;
  customer_id: string;
  amount_cents: string;
  due_date: string;
  description: string | null;
  gateway_ref: string | null;
  gateway_payment_url: string | null;
  nf_issue_id: string | null;
  correlation_id: string;
  created_at: string;
};

async function assertNfIssueLinkable(
  db: Sql,
  tenantId: string,
  nfIssueId: string,
): Promise<void> {
  const [issue] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND id = ${nfIssueId}::uuid
  `;
  if (!issue) throw new NotFoundError("NF_ISSUE");

  const [linked] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND nf_issue_id = ${nfIssueId}::uuid
      AND status NOT IN (
        'cancelled'::exeq_core.charge_status,
        'failed'::exeq_core.charge_status
      )
    LIMIT 1
  `;
  if (linked) throw new ChargeNfIssueAlreadyLinkedError(linked.id);
}

export async function findChargeByIdempotency(
  db: Sql,
  tenantId: string,
  idempotencyKey: string,
): Promise<ChargeRow | null> {
  const [row] = await db<ChargeRow[]>`
    SELECT id, status, idempotency_key, customer_id, amount_cents::text,
           due_date::text, description, gateway_ref, gateway_payment_url, nf_issue_id,
           correlation_id, created_at::text
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${idempotencyKey}
  `;
  return row ?? null;
}

export async function createCharge(
  db: Sql,
  tenantId: string,
  input: CreateChargeRequest,
  correlationId: string,
): Promise<ChargeRow> {
  const existing = await findChargeByIdempotency(db, tenantId, input.idempotency_key);
  if (existing) throw new DuplicateChargeIdempotencyError(existing.id);

  if (input.nf_issue_id) {
    await assertNfIssueLinkable(db, tenantId, input.nf_issue_id);
  }

  const [row] = await db<ChargeRow[]>`
    INSERT INTO exeq_core.charge (
      tenant_id, idempotency_key, status, customer_id, amount_cents,
      due_date, description, nf_issue_id, correlation_id
    ) VALUES (
      ${tenantId}::uuid, ${input.idempotency_key}, 'pending',
      ${input.customer_id}::uuid, ${input.amount_cents},
      ${input.due_date}::date, ${input.description ?? null},
      ${input.nf_issue_id ?? null}::uuid, ${correlationId}::uuid
    )
    RETURNING id, status, idempotency_key, customer_id, amount_cents::text,
              due_date::text, description, gateway_ref, gateway_payment_url, nf_issue_id,
              correlation_id, created_at::text
  `;

  await appendAuditLog(db, tenantId, "charge", row!.id, "created", null, {
    amount_cents: input.amount_cents,
  });

  return row!;
}

type ChargeCursor = { created_at: string; id: string };

function encodeChargeCursor(cursor: ChargeCursor): string {
  return Buffer.from(`${cursor.created_at}|${cursor.id}`, "utf8").toString("base64url");
}

function decodeChargeCursor(cursor: string): ChargeCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep < 0) return null;
    return { created_at: raw.slice(0, sep), id: raw.slice(sep + 1) };
  } catch {
    return null;
  }
}

export async function listCharges(
  db: Sql,
  tenantId: string,
  query: ListChargesQuery = { limit: 50 },
): Promise<{ items: ChargeRow[]; next_cursor: string | null }> {
  const limit = query.limit ?? 50;
  const decoded = query.cursor ? decodeChargeCursor(query.cursor) : null;

  const rows = await db<ChargeRow[]>`
    SELECT id, status, idempotency_key, customer_id, amount_cents::text,
           due_date::text, description, gateway_ref, gateway_payment_url, nf_issue_id,
           correlation_id, created_at::text
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND (${query.status ?? null}::exeq_core.charge_status IS NULL
           OR status = ${query.status ?? null}::exeq_core.charge_status)
      AND (${query.correlation_id ?? null}::uuid IS NULL OR correlation_id = ${query.correlation_id ?? null}::uuid)
      AND (${query.idempotency_key ?? null}::text IS NULL OR idempotency_key = ${query.idempotency_key ?? null})
      AND (${query.nf_issue_id ?? null}::uuid IS NULL OR nf_issue_id = ${query.nf_issue_id ?? null}::uuid)
      AND (
        ${decoded?.created_at ?? null}::timestamptz IS NULL
        OR created_at < ${decoded?.created_at ?? null}::timestamptz
        OR (
          created_at = ${decoded?.created_at ?? null}::timestamptz
          AND id < ${decoded?.id ?? null}::uuid
        )
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const next_cursor =
    hasMore && last ? encodeChargeCursor({ created_at: last.created_at, id: last.id }) : null;

  return { items: page, next_cursor };
}

const MAX_EXPORT_ROWS = 5000;

export async function exportChargesCsv(
  db: Sql,
  tenantId: string,
  query: ListChargesQuery,
): Promise<string> {
  const items: ChargeRow[] = [];
  let cursor: string | undefined;

  while (items.length < MAX_EXPORT_ROWS) {
    const page = await listCharges(db, tenantId, {
      ...query,
      limit: 200,
      cursor,
    });
    items.push(...page.items);
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }

  const slice = items.slice(0, MAX_EXPORT_ROWS);
  const headers = [
    "id",
    "status",
    "customer_id",
    "amount_cents",
    "due_date",
    "nf_issue_id",
    "gateway_ref",
    "created_at",
  ];
  const rows = slice.map((c) => [
    c.id,
    c.status,
    c.customer_id,
    Number(c.amount_cents),
    c.due_date,
    c.nf_issue_id ?? "",
    c.gateway_ref ?? "",
    c.created_at,
  ]);
  return rowsToCsv(headers, rows);
}

export async function getChargeStats(db: Sql, tenantId: string) {
  const [pendingRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND status IN ('pending'::exeq_core.charge_status, 'registered'::exeq_core.charge_status)
  `;

  const [paidRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'paid'::exeq_core.charge_status
      AND updated_at >= now() - interval '7 days'
  `;

  const [failedRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND status IN ('failed'::exeq_core.charge_status, 'cancelled'::exeq_core.charge_status)
      AND updated_at >= now() - interval '7 days'
  `;

  const [totalRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count FROM exeq_core.charge WHERE tenant_id = ${tenantId}::uuid
  `;

  return {
    total: Number(totalRow?.count ?? 0),
    pending: Number(pendingRow?.count ?? 0),
    paid_last_7_days: Number(paidRow?.count ?? 0),
    failed_last_7_days: Number(failedRow?.count ?? 0),
  };
}

export async function getChargeDetail(db: Sql, tenantId: string, chargeId: string) {
  const [charge] = await db<ChargeRow[]>`
    SELECT id, status, idempotency_key, customer_id, amount_cents::text AS amount_cents,
           due_date::text AS due_date, description, gateway_ref, gateway_payment_url, nf_issue_id,
           correlation_id, created_at::text AS created_at
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid AND id = ${chargeId}::uuid
  `;
  if (!charge) throw new NotFoundError("CHARGE");

  const paymentEvents = await db`
    SELECT id, amount_cents::text AS amount_cents, paid_at::text AS paid_at,
           gateway_ref, webhook_inbox_id, created_at::text AS created_at
    FROM exeq_core.payment_event
    WHERE tenant_id = ${tenantId}::uuid AND charge_id = ${chargeId}::uuid
    ORDER BY created_at ASC
  `;

  return {
    ...charge,
    amount_cents: Number(charge.amount_cents),
    gateway_mode: inferGatewayIntegrationMode(charge.gateway_ref),
    gateway_sandbox_url:
      charge.gateway_payment_url ?? resolveGatewaySandboxUrl(charge.gateway_ref),
    payment_events: paymentEvents.map((e) => ({
      ...e,
      amount_cents: Number(e.amount_cents),
    })),
  };
}

export async function transitionCharge(
  db: Sql,
  tenantId: string,
  chargeId: string,
  toStatus: ChargeStatus,
  patch?: { gateway_ref?: string; gateway_payment_url?: string | null },
): Promise<ChargeRow> {
  const [current] = await db<{ status: ChargeStatus }[]>`
    SELECT status FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid AND id = ${chargeId}::uuid
  `;
  if (!current) throw new NotFoundError("CHARGE");

  try {
    assertChargeTransition(current.status, toStatus);
  } catch (err) {
    if (err instanceof InvalidChargeTransitionError) throw err;
    throw err;
  }

  const [row] = await db<ChargeRow[]>`
    UPDATE exeq_core.charge SET
      status = ${toStatus}::exeq_core.charge_status,
      gateway_ref = COALESCE(${patch?.gateway_ref ?? null}, gateway_ref),
      gateway_payment_url = COALESCE(${patch?.gateway_payment_url ?? null}, gateway_payment_url),
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${chargeId}::uuid
    RETURNING id, status, idempotency_key, customer_id, amount_cents::text,
              due_date::text, description, gateway_ref, gateway_payment_url, nf_issue_id,
              correlation_id, created_at::text
  `;

  return row!;
}

export async function findChargeForReconciliation(
  db: Sql,
  tenantId: string,
  chargeId?: string,
  gatewayRef?: string,
): Promise<{ id: string; status: ChargeStatus; amount_cents: number } | null> {
  if (chargeId) {
    const [row] = await db<{ id: string; status: ChargeStatus; amount_cents: string }[]>`
      SELECT id, status, amount_cents::text
      FROM exeq_core.charge
      WHERE tenant_id = ${tenantId}::uuid AND id = ${chargeId}::uuid
    `;
    return row ? { ...row, amount_cents: Number(row.amount_cents) } : null;
  }
  if (gatewayRef) {
    const [row] = await db<{ id: string; status: ChargeStatus; amount_cents: string }[]>`
      SELECT id, status, amount_cents::text
      FROM exeq_core.charge
      WHERE tenant_id = ${tenantId}::uuid AND gateway_ref = ${gatewayRef}
    `;
    return row ? { ...row, amount_cents: Number(row.amount_cents) } : null;
  }
  return null;
}

export function hashWebhookPayload(payload: unknown): string {
  return sha256Hex(JSON.stringify(payload));
}
