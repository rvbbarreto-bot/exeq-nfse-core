import type {
  ChannelDraft,
  ChannelNotificationEvent,
  ChannelSessionStatus,
  CreateChannelSessionRequest,
} from "@exeq/shared";
import { getMissingDraftFields, isChannelDraftReadyForConfirm, mergeChannelDraftPatch } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { isChannelPhoneAllowed } from "./channel-phone-guard.js";
import { NotFoundError } from "../master-data/master-data.service.js";

export class DuplicateChannelSessionError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super("DUPLICATE_CHANNEL_SESSION");
    this.name = "DuplicateChannelSessionError";
    this.sessionId = sessionId;
  }
}

export class ChannelSessionNotReadyError extends Error {
  constructor(readonly missing: string[]) {
    super("CHANNEL_SESSION_NOT_READY");
    this.name = "ChannelSessionNotReadyError";
  }
}

type SessionRow = {
  id: string;
  status: ChannelSessionStatus;
  phone_e164: string;
  idempotency_key: string;
  draft_payload: ChannelDraft;
  nf_issue_id: string | null;
  correlation_id: string;
  created_at: string;
};

export async function findChannelSessionByIdempotency(
  db: Sql,
  tenantId: string,
  idempotencyKey: string,
): Promise<SessionRow | null> {
  const [row] = await db<SessionRow[]>`
    SELECT id, status, phone_e164, idempotency_key, draft_payload,
           nf_issue_id, correlation_id, created_at::text
    FROM exeq_core.channel_session
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${idempotencyKey}
  `;
  return row ?? null;
}

/** Sessão aberta mais recente do telefone (coleta ou aguardando confirmação). */
export async function findActiveChannelSessionByPhone(
  db: Sql,
  tenantId: string,
  phoneE164: string,
): Promise<SessionRow | null> {
  const [row] = await db<SessionRow[]>`
    SELECT id, status, phone_e164, idempotency_key, draft_payload,
           nf_issue_id, correlation_id, created_at::text
    FROM exeq_core.channel_session
    WHERE tenant_id = ${tenantId}::uuid
      AND phone_e164 = ${phoneE164}
      AND status IN (
        'collecting'::exeq_core.channel_session_status,
        'ready_to_confirm'::exeq_core.channel_session_status,
        'pending_review'::exeq_core.channel_session_status
      )
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

export async function createChannelSession(
  db: Sql,
  tenantId: string,
  input: CreateChannelSessionRequest,
  correlationId: string,
): Promise<SessionRow> {
  const existing = await findChannelSessionByIdempotency(db, tenantId, input.idempotency_key);
  if (existing) throw new DuplicateChannelSessionError(existing.id);

  const [row] = await db<SessionRow[]>`
    INSERT INTO exeq_core.channel_session (
      tenant_id, idempotency_key, phone_e164, status, draft_payload, correlation_id
    ) VALUES (
      ${tenantId}::uuid, ${input.idempotency_key}, ${input.phone_e164},
      'collecting', ${db.json({})}, ${correlationId}::uuid
    )
    RETURNING id, status, phone_e164, idempotency_key, draft_payload,
              nf_issue_id, correlation_id, created_at::text
  `;
  return row!;
}

export async function getChannelSession(
  db: Sql,
  tenantId: string,
  sessionId: string,
): Promise<SessionRow & { missing_fields: string[] }> {
  const [row] = await db<SessionRow[]>`
    SELECT id, status, phone_e164, idempotency_key, draft_payload,
           nf_issue_id, correlation_id, created_at::text
    FROM exeq_core.channel_session
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
  `;
  if (!row) throw new NotFoundError("CHANNEL_SESSION");
  const draft = row.draft_payload ?? {};
  return {
    ...row,
    draft_payload: draft,
    missing_fields: getMissingDraftFields(draft),
  };
}

export async function collectChannelSessionDraft(
  db: Sql,
  tenantId: string,
  sessionId: string,
  patch: Partial<ChannelDraft>,
): Promise<SessionRow & { missing_fields: string[] }> {
  const current = await getChannelSession(db, tenantId, sessionId);
  if (current.status === "emitted") {
    return current;
  }

  const merged = mergeChannelDraftPatch(current.draft_payload, patch);
  let nextStatus: ChannelSessionStatus;
  if (current.status === "pending_review") {
    nextStatus = isChannelDraftReadyForConfirm(merged) ? "ready_to_confirm" : "collecting";
  } else {
    nextStatus = isChannelDraftReadyForConfirm(merged) ? "ready_to_confirm" : "collecting";
  }

  const [row] = await db<SessionRow[]>`
    UPDATE exeq_core.channel_session SET
      draft_payload = ${db.json(merged)},
      status = ${nextStatus}::exeq_core.channel_session_status,
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
    RETURNING id, status, phone_e164, idempotency_key, draft_payload,
              nf_issue_id, correlation_id, created_at::text
  `;

  return {
    ...row!,
    missing_fields: getMissingDraftFields(merged),
  };
}

export async function markChannelSessionEmitted(
  db: Sql,
  tenantId: string,
  sessionId: string,
  issueId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.channel_session SET
      status = 'emitted'::exeq_core.channel_session_status,
      nf_issue_id = ${issueId}::uuid,
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
  `;
}

export async function setChannelSessionPendingReview(
  db: Sql,
  tenantId: string,
  sessionId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.channel_session SET
      status = 'pending_review'::exeq_core.channel_session_status,
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
  `;
}

export async function markChannelSessionError(
  db: Sql,
  tenantId: string,
  sessionId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.channel_session SET
      status = 'error'::exeq_core.channel_session_status,
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
  `;
}

export async function markChannelSessionEmitting(
  db: Sql,
  tenantId: string,
  sessionId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.channel_session SET
      status = 'emitting'::exeq_core.channel_session_status,
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${sessionId}::uuid
  `;
}

export async function findChannelSessionByIssueId(
  db: Sql,
  tenantId: string,
  issueId: string,
): Promise<SessionRow | null> {
  const [row] = await db<SessionRow[]>`
    SELECT id, status, phone_e164, idempotency_key, draft_payload,
           nf_issue_id, correlation_id, created_at::text
    FROM exeq_core.channel_session
    WHERE tenant_id = ${tenantId}::uuid AND nf_issue_id = ${issueId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}

export async function createChannelNotification(
  db: Sql,
  tenantId: string,
  input: {
    session_id?: string;
    nf_issue_id: string;
    phone_e164: string;
    event_type: ChannelNotificationEvent;
    message_body: string;
  },
): Promise<{ id: string }> {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO exeq_core.channel_notification (
      tenant_id, session_id, nf_issue_id, phone_e164, event_type, message_body
    ) VALUES (
      ${tenantId}::uuid,
      ${input.session_id ?? null}::uuid,
      ${input.nf_issue_id}::uuid,
      ${input.phone_e164},
      ${input.event_type},
      ${input.message_body}
    )
    RETURNING id
  `;
  return row!;
}

export async function listPendingChannelNotifications(
  db: Sql,
  tenantId: string,
  limit = 20,
) {
  const rows = await db`
    SELECT id, phone_e164, event_type, message_body, nf_issue_id,
           created_at::text AS created_at
    FROM exeq_core.channel_notification
    WHERE tenant_id = ${tenantId}::uuid AND status = 'pending'::exeq_core.channel_notification_status
    ORDER BY created_at ASC
    LIMIT ${limit * 3}
  `;

  return rows.filter((row) => isChannelPhoneAllowed(row.phone_e164)).slice(0, limit);
}

export async function ackChannelNotification(
  db: Sql,
  tenantId: string,
  notificationId: string,
): Promise<void> {
  await db`
    UPDATE exeq_core.channel_notification SET
      status = 'sent'::exeq_core.channel_notification_status,
      sent_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${notificationId}::uuid
  `;
}
