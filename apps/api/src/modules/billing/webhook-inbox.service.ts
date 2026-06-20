import type { ListWebhookInboxQuery, WebhookInboxStatus } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { rowsToCsv } from "../../lib/csv.js";
import { sha256Hex } from "../../lib/hash.js";
import { asJsonValue } from "../../lib/json.js";

export class DuplicateWebhookInboxError extends Error {
  readonly inboxId: string;
  readonly status: WebhookInboxStatus;

  constructor(inboxId: string, status: WebhookInboxStatus) {
    super("DUPLICATE_WEBHOOK_INBOX");
    this.name = "DuplicateWebhookInboxError";
    this.inboxId = inboxId;
    this.status = status;
  }
}

type InboxRow = {
  id: string;
  status: WebhookInboxStatus;
  idempotency_key: string;
};

export async function findWebhookInboxByIdempotency(
  db: Sql,
  tenantId: string,
  idempotencyKey: string,
): Promise<InboxRow | null> {
  const [row] = await db<InboxRow[]>`
    SELECT id, status, idempotency_key
    FROM exeq_core.webhook_inbox
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${idempotencyKey}
  `;
  return row ?? null;
}

export async function createWebhookInbox(
  db: Sql,
  tenantId: string,
  idempotencyKey: string,
  rawPayload: unknown,
  signature: string | null,
): Promise<InboxRow> {
  const existing = await findWebhookInboxByIdempotency(db, tenantId, idempotencyKey);
  if (existing) throw new DuplicateWebhookInboxError(existing.id, existing.status);

  const payloadHash = sha256Hex(JSON.stringify(rawPayload));

  const [row] = await db<InboxRow[]>`
    INSERT INTO exeq_core.webhook_inbox (
      tenant_id, idempotency_key, status, signature, raw_payload, payload_hash
    ) VALUES (
      ${tenantId}::uuid, ${idempotencyKey}, 'received',
      ${signature}, ${db.json(asJsonValue(rawPayload))}, ${payloadHash}
    )
    RETURNING id, status, idempotency_key
  `;

  return row!;
}

export async function markWebhookInboxProcessing(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.webhook_inbox
    SET status = 'processing'::exeq_core.webhook_inbox_status
    WHERE tenant_id = ${tenantId}::uuid AND id = ${inboxId}::uuid
  `;
}

export async function markWebhookInboxProcessed(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.webhook_inbox
    SET status = 'processed'::exeq_core.webhook_inbox_status,
        processed_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${inboxId}::uuid
  `;
}

export async function markWebhookInboxFailed(
  db: Sql,
  tenantId: string,
  inboxId: string,
  errorMessage: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.webhook_inbox
    SET status = 'failed'::exeq_core.webhook_inbox_status,
        error_message = ${errorMessage},
        processed_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${inboxId}::uuid
  `;
}

export async function getWebhookInboxPayload(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<{ raw_payload: unknown; status: WebhookInboxStatus }> {
  const [row] = await db<{ raw_payload: unknown; status: WebhookInboxStatus }[]>`
    SELECT raw_payload, status
    FROM exeq_core.webhook_inbox
    WHERE tenant_id = ${tenantId}::uuid AND id = ${inboxId}::uuid
  `;
  if (!row) throw new Error("WEBHOOK_INBOX_NOT_FOUND");
  return row;
}

export type WebhookInboxDetail = {
  id: string;
  status: WebhookInboxStatus;
  idempotency_key: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
};

type InboxListRow = {
  id: string;
  status: WebhookInboxStatus;
  idempotency_key: string;
  error_message: string | null;
  charge_id: string | null;
  created_at: string;
  processed_at: string | null;
};

type InboxCursor = { created_at: string; id: string };

function encodeInboxCursor(cursor: InboxCursor): string {
  return Buffer.from(`${cursor.created_at}|${cursor.id}`, "utf8").toString("base64url");
}

function decodeInboxCursor(cursor: string): InboxCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep < 0) return null;
    return { created_at: raw.slice(0, sep), id: raw.slice(sep + 1) };
  } catch {
    return null;
  }
}

export async function listWebhookInboxes(
  db: Sql,
  tenantId: string,
  query: ListWebhookInboxQuery = { limit: 50 },
): Promise<{ items: InboxListRow[]; next_cursor: string | null }> {
  const limit = query.limit ?? 50;
  const decoded = query.cursor ? decodeInboxCursor(query.cursor) : null;

  const rows = await db<InboxListRow[]>`
    SELECT w.id, w.status, w.idempotency_key, w.error_message,
           w.created_at::text AS created_at,
           w.processed_at::text AS processed_at,
           (
             SELECT pe.charge_id
             FROM exeq_core.payment_event pe
             WHERE pe.tenant_id = w.tenant_id AND pe.webhook_inbox_id = w.id
             ORDER BY pe.created_at DESC
             LIMIT 1
           ) AS charge_id
    FROM exeq_core.webhook_inbox w
    WHERE w.tenant_id = ${tenantId}::uuid
      AND (${query.status ?? null}::exeq_core.webhook_inbox_status IS NULL
           OR w.status = ${query.status ?? null}::exeq_core.webhook_inbox_status)
      AND (${query.idempotency_key ?? null}::text IS NULL OR w.idempotency_key = ${query.idempotency_key ?? null})
      AND (
        ${decoded?.created_at ?? null}::timestamptz IS NULL
        OR w.created_at < ${decoded?.created_at ?? null}::timestamptz
        OR (
          w.created_at = ${decoded?.created_at ?? null}::timestamptz
          AND w.id < ${decoded?.id ?? null}::uuid
        )
      )
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const next_cursor =
    hasMore && last ? encodeInboxCursor({ created_at: last.created_at, id: last.id }) : null;

  return { items: page, next_cursor };
}

export async function getWebhookInboxDetail(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<WebhookInboxDetail | null> {
  const [row] = await db<WebhookInboxDetail[]>`
    SELECT id, status, idempotency_key, error_message,
           created_at::text AS created_at,
           processed_at::text AS processed_at
    FROM exeq_core.webhook_inbox
    WHERE tenant_id = ${tenantId}::uuid AND id = ${inboxId}::uuid
  `;
  return row ?? null;
}

export async function resetWebhookInboxForReprocess(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.webhook_inbox SET
      status = 'received'::exeq_core.webhook_inbox_status,
      error_message = null,
      processed_at = null
    WHERE tenant_id = ${tenantId}::uuid AND id = ${inboxId}::uuid
      AND status = 'failed'::exeq_core.webhook_inbox_status
  `;
}

const MAX_EXPORT_ROWS = 5000;

export async function exportWebhookInboxesCsv(
  db: Sql,
  tenantId: string,
  query: ListWebhookInboxQuery,
): Promise<string> {
  const items: InboxListRow[] = [];
  let cursor: string | undefined;

  while (items.length < MAX_EXPORT_ROWS) {
    const page = await listWebhookInboxes(db, tenantId, {
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
    "idempotency_key",
    "charge_id",
    "error_message",
    "created_at",
    "processed_at",
  ];
  const rows = slice.map((w) => [
    w.id,
    w.status,
    w.idempotency_key,
    w.charge_id ?? "",
    w.error_message ?? "",
    w.created_at,
    w.processed_at ?? "",
  ]);
  return rowsToCsv(headers, rows);
}

export async function countPaymentEventsForInbox(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<number> {
  const [row] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.payment_event
    WHERE tenant_id = ${tenantId}::uuid AND webhook_inbox_id = ${inboxId}::uuid
  `;
  return Number(row?.count ?? 0);
}
