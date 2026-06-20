import type {
  EmitNfseRequest,
  ExeqNfseV1,
  ListNfIssuesQuery,
  NfIssueStatus,
  TaxResolveResponse,
} from "@exeq/shared";
import { PILOT_IBGE_CODES, PILOT_MUNICIPIOS } from "@exeq/shared";
import { assertNfIssueTransition, isTerminalNfIssueStatus, InvalidNfIssueTransitionError } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { rowsToCsv } from "../../lib/csv.js";
import { sha256Hex } from "../../lib/hash.js";
import { asJsonValue } from "../../lib/json.js";
import { NotFoundError } from "../master-data/master-data.service.js";

export class DuplicateIdempotencyError extends Error {
  readonly issueId: string;

  constructor(issueId: string) {
    super("DUPLICATE_IDEMPOTENCY_KEY");
    this.name = "DuplicateIdempotencyError";
    this.issueId = issueId;
  }
}

type IssueRow = {
  id: string;
  status: NfIssueStatus;
  idempotency_key: string;
  provider_id: string;
  customer_id: string;
  service_id: string;
  ibge_code: string;
  competence_date: string;
  amount_cents: string;
  resolved_rule_id: string | null;
  focus_ref: string | null;
  correlation_id: string;
  created_at: string;
};

export async function findIssueByIdempotency(
  db: Sql,
  tenantId: string,
  idempotencyKey: string,
): Promise<IssueRow | null> {
  const [row] = await db<IssueRow[]>`
    SELECT id, status, idempotency_key, provider_id, customer_id, service_id,
           ibge_code, competence_date::text, amount_cents::text,
           resolved_rule_id, focus_ref, correlation_id, created_at::text
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${idempotencyKey}
  `;
  return row ?? null;
}

export async function createNfIssueDraft(
  db: Sql,
  tenantId: string,
  input: EmitNfseRequest,
  correlationId: string,
): Promise<IssueRow> {
  const existing = await findIssueByIdempotency(db, tenantId, input.idempotency_key);
  if (existing) throw new DuplicateIdempotencyError(existing.id);

  const [row] = await db<IssueRow[]>`
    INSERT INTO exeq_core.nf_issue (
      tenant_id, idempotency_key, status, provider_id, customer_id, service_id,
      ibge_code, competence_date, amount_cents, correlation_id
    ) VALUES (
      ${tenantId}::uuid, ${input.idempotency_key}, 'draft',
      ${input.provider_id}::uuid, ${input.customer_id}::uuid, ${input.service_id}::uuid,
      ${input.ibge_code}, ${input.competence_date}::date, ${input.amount_cents},
      ${correlationId}::uuid
    )
    RETURNING id, status, idempotency_key, provider_id, customer_id, service_id,
              ibge_code, competence_date::text, amount_cents::text,
              resolved_rule_id, focus_ref, correlation_id, created_at::text
  `;

  await appendNfIssueEvent(db, tenantId, row!.id, null, "draft", "api", {
    action: "created",
  });

  return row!;
}

export async function transitionNfIssue(
  db: Sql,
  tenantId: string,
  issueId: string,
  toStatus: NfIssueStatus,
  actor: string,
  metadata?: Record<string, unknown>,
  patch?: {
    resolved_rule_id?: string;
    resolved_params?: TaxResolveResponse;
    internal_payload?: ExeqNfseV1;
    focus_ref?: string;
    focus_status_raw?: unknown;
    payload_hash?: string;
    nfse_provider_kind?: string;
  },
): Promise<IssueRow> {
  const [current] = await db<{ status: NfIssueStatus }[]>`
    SELECT status FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND id = ${issueId}::uuid
  `;
  if (!current) throw new NotFoundError("NF_ISSUE");

  try {
    assertNfIssueTransition(current.status, toStatus);
  } catch (err) {
    if (err instanceof InvalidNfIssueTransitionError) throw err;
    throw err;
  }

  const [row] = await db<IssueRow[]>`
    UPDATE exeq_core.nf_issue SET
      status = ${toStatus}::exeq_core.nf_issue_status,
      resolved_rule_id = COALESCE(${patch?.resolved_rule_id ?? null}::uuid, resolved_rule_id),
      resolved_params = COALESCE(${
        patch?.resolved_params != null ? db.json(asJsonValue(patch.resolved_params)) : null
      }, resolved_params),
      internal_payload = COALESCE(${
        patch?.internal_payload != null ? db.json(asJsonValue(patch.internal_payload)) : null
      }, internal_payload),
      focus_ref = COALESCE(${patch?.focus_ref ?? null}, focus_ref),
      focus_status_raw = COALESCE(${
        patch?.focus_status_raw != null ? db.json(asJsonValue(patch.focus_status_raw)) : null
      }, focus_status_raw),
      nfse_provider_kind = COALESCE(${patch?.nfse_provider_kind ?? null}::exeq_core.nfse_provider_kind, nfse_provider_kind),
      payload_hash = COALESCE(${patch?.payload_hash ?? null}, payload_hash),
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${issueId}::uuid
    RETURNING id, status, idempotency_key, provider_id, customer_id, service_id,
              ibge_code, competence_date::text, amount_cents::text,
              resolved_rule_id, focus_ref, correlation_id, created_at::text
  `;

  await appendNfIssueEvent(db, tenantId, issueId, current.status, toStatus, actor, metadata);

  if (isTerminalNfIssueStatus(toStatus)) {
    const { maybeEnqueueChannelNotification } = await import(
      "../channel/confirm-channel-session.use-case.js"
    );
    await maybeEnqueueChannelNotification(db, tenantId, issueId, toStatus);
  }

  return row!;
}

export async function appendNfIssueEvent(
  db: Sql,
  tenantId: string,
  issueId: string,
  fromStatus: NfIssueStatus | null,
  toStatus: NfIssueStatus,
  actor: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db`
    INSERT INTO exeq_core.nf_issue_event (
      tenant_id, nf_issue_id, from_status, to_status, actor, metadata
    ) VALUES (
      ${tenantId}::uuid, ${issueId}::uuid,
      ${fromStatus}::exeq_core.nf_issue_status,
      ${toStatus}::exeq_core.nf_issue_status,
      ${actor}, ${metadata != null ? db.json(asJsonValue(metadata)) : null}
    )
  `;
}

export async function appendAuditLog(
  db: Sql,
  tenantId: string,
  entityType: string,
  entityId: string,
  action: string,
  payloadHash: string | null,
  metadata?: Record<string, unknown>,
  actor = "system",
): Promise<void> {
  await db`
    INSERT INTO exeq_core.audit_log (
      tenant_id, entity_type, entity_id, action, payload_hash, metadata, actor
    ) VALUES (
      ${tenantId}::uuid, ${entityType}, ${entityId}::uuid,
      ${action}, ${payloadHash}, ${metadata != null ? db.json(asJsonValue(metadata)) : null}, ${actor}
    )
  `;
}

export async function getNfIssueDetail(db: Sql, tenantId: string, issueId: string) {
  const [issue] = await db`
    SELECT id, status, idempotency_key, provider_id, customer_id, service_id,
           ibge_code, competence_date::text AS competence_date, amount_cents::text AS amount_cents,
           resolved_rule_id, focus_ref, correlation_id, created_at::text AS created_at
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND id = ${issueId}::uuid
  `;
  if (!issue) throw new NotFoundError("NF_ISSUE");

  const events = await db`
    SELECT id, from_status, to_status, actor, metadata, occurred_at::text AS occurred_at
    FROM exeq_core.nf_issue_event
    WHERE tenant_id = ${tenantId}::uuid AND nf_issue_id = ${issueId}::uuid
    ORDER BY occurred_at ASC, id ASC
  `;

  return {
    ...issue,
    amount_cents: Number(issue.amount_cents),
    events,
  };
}

export async function getNfIssueForProcessing(db: Sql, tenantId: string, issueId: string) {
  const [issue] = await db`
    SELECT id, status, internal_payload, focus_ref, correlation_id, ibge_code,
           nfse_provider_kind::text AS nfse_provider_kind
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND id = ${issueId}::uuid
  `;
  if (!issue) throw new NotFoundError("NF_ISSUE");
  return issue as {
    id: string;
    status: NfIssueStatus;
    internal_payload: ExeqNfseV1 | null;
    focus_ref: string | null;
    correlation_id: string;
    ibge_code: string;
    nfse_provider_kind: string | null;
  };
}

export function hashPayload(payload: unknown): string {
  return sha256Hex(JSON.stringify(payload));
}

export { isTerminalNfIssueStatus };

type IssueListRow = {
  id: string;
  status: NfIssueStatus;
  ibge_code: string;
  competence_date: string;
  amount_cents: string;
  focus_ref: string | null;
  created_at: string;
};

type IssueCursor = { created_at: string; id: string };

function encodeIssueCursor(cursor: IssueCursor): string {
  return Buffer.from(`${cursor.created_at}|${cursor.id}`, "utf8").toString("base64url");
}

function decodeIssueCursor(cursor: string): IssueCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep < 0) return null;
    return { created_at: raw.slice(0, sep), id: raw.slice(sep + 1) };
  } catch {
    return null;
  }
}

export async function listNfIssues(
  db: Sql,
  tenantId: string,
  filters: ListNfIssuesQuery = { limit: 50 },
): Promise<{
  items: Array<Omit<IssueListRow, "amount_cents"> & { amount_cents: number }>;
  next_cursor: string | null;
}> {
  const limit = filters.limit ?? 50;
  const decoded = filters.cursor ? decodeIssueCursor(filters.cursor) : null;

  const rows = await db<IssueListRow[]>`
    SELECT id, status, ibge_code, competence_date::text AS competence_date,
           amount_cents::text AS amount_cents, focus_ref, created_at::text AS created_at
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid
      AND (${filters.status ?? null}::exeq_core.nf_issue_status IS NULL OR status = ${filters.status ?? null}::exeq_core.nf_issue_status)
      AND (${filters.ibge_code ?? null}::text IS NULL OR ibge_code = ${filters.ibge_code ?? null})
      AND (${filters.from_date ?? null}::date IS NULL OR created_at >= ${filters.from_date ?? null}::date)
      AND (${filters.to_date ?? null}::date IS NULL OR created_at < (${filters.to_date ?? null}::date + interval '1 day'))
      AND (${filters.correlation_id ?? null}::uuid IS NULL OR correlation_id = ${filters.correlation_id ?? null}::uuid)
      AND (${filters.idempotency_key ?? null}::text IS NULL OR idempotency_key = ${filters.idempotency_key ?? null})
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
    hasMore && last ? encodeIssueCursor({ created_at: last.created_at, id: last.id }) : null;

  return {
    items: page.map((r) => ({
      ...r,
      amount_cents: Number(r.amount_cents),
    })),
    next_cursor,
  };
}

const MAX_EXPORT_ROWS = 5000;

export async function exportNfIssuesCsv(
  db: Sql,
  tenantId: string,
  filters: ListNfIssuesQuery,
): Promise<string> {
  const items: Awaited<ReturnType<typeof listNfIssues>>["items"] = [];
  let cursor: string | undefined;

  while (items.length < MAX_EXPORT_ROWS) {
    const page = await listNfIssues(db, tenantId, {
      ...filters,
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
    "ibge_code",
    "competence_date",
    "amount_cents",
    "focus_ref",
    "created_at",
  ];
  const rows = slice.map((i) => [
    i.id,
    i.status,
    i.ibge_code,
    i.competence_date,
    i.amount_cents,
    i.focus_ref ?? "",
    i.created_at,
  ]);
  return rowsToCsv(headers, rows);
}

export async function exportNfIssueEventsCsv(
  db: Sql,
  tenantId: string,
  issueId: string,
): Promise<string> {
  const detail = await getNfIssueDetail(db, tenantId, issueId);
  const headers = ["event_id", "from_status", "to_status", "actor", "occurred_at", "metadata_json"];
  const rows = detail.events.map((e) => [
    e.id,
    e.from_status ?? "",
    e.to_status,
    e.actor,
    e.occurred_at,
    e.metadata ? JSON.stringify(e.metadata) : "",
  ]);
  return rowsToCsv(headers, rows);
}

export async function getNfIssueStats(db: Sql, tenantId: string) {
  const statusRows = await db<{ status: NfIssueStatus; count: string }[]>`
    SELECT status, count(*)::text AS count
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid
    GROUP BY status
  `;

  const [totalRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count FROM exeq_core.nf_issue WHERE tenant_id = ${tenantId}::uuid
  `;

  const [last7Row] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND created_at >= now() - interval '7 days'
  `;

  const pilotRows = await db<{ ibge_code: string; count: string }[]>`
    SELECT ibge_code, count(*)::text AS count
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid
      AND ibge_code = ANY(${PILOT_IBGE_CODES})
    GROUP BY ibge_code
  `;

  const byStatus = Object.fromEntries(
    statusRows.map((r) => [r.status, Number(r.count)]),
  ) as Record<NfIssueStatus, number>;

  const allStatuses: NfIssueStatus[] = [
    "draft",
    "pending_tax",
    "queued",
    "submitting",
    "polling",
    "authorized",
    "rejected",
    "cancelled",
    "failed",
  ];
  for (const s of allStatuses) {
    if (byStatus[s] === undefined) byStatus[s] = 0;
  }

  const pilotMap = new Map(pilotRows.map((r) => [r.ibge_code, Number(r.count)]));

  return {
    total: Number(totalRow?.count ?? 0),
    by_status: byStatus,
    last_7_days: Number(last7Row?.count ?? 0),
    pilot_municipios: PILOT_MUNICIPIOS.map((m) => ({
      ibge_code: m.ibge_code,
      label: m.label,
      count: pilotMap.get(m.ibge_code) ?? 0,
    })),
  };
}
