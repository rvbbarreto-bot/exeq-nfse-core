import {
  buildChannelStatusMessage,
  draftToEmitRequest,
  isTerminalNfIssueStatus,
  type ChannelNotificationEvent,
  type NfIssueStatus,
} from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { isChannelPhoneAllowed } from "./channel-phone-guard.js";
import { emitNfse } from "../issuance/emit-nf.use-case.js";
import { DuplicateIdempotencyError } from "../issuance/nf-issue.service.js";
import {
  createChannelNotification,
  findChannelSessionByIdempotency,
  getChannelSession,
  markChannelSessionEmitted,
  ChannelSessionNotReadyError,
} from "./channel.service.js";

export async function confirmChannelSession(
  db: Sql,
  tenantId: string,
  sessionId: string,
  correlationId: string,
) {
  const session = await getChannelSession(db, tenantId, sessionId);

  if (session.status === "emitted" && session.nf_issue_id) {
    const [issue] = await db<{ id: string; status: string }[]>`
      SELECT id, status FROM exeq_core.nf_issue
      WHERE tenant_id = ${tenantId}::uuid AND id = ${session.nf_issue_id}::uuid
    `;
    return {
      session_id: sessionId,
      issue_id: issue!.id,
      status: issue!.status,
      duplicate: true,
    };
  }

  if (session.status !== "ready_to_confirm") {
    throw new ChannelSessionNotReadyError(session.missing_fields);
  }

  const emitRequest = draftToEmitRequest(session.draft_payload, session.idempotency_key);

  let issue;
  try {
    issue = await emitNfse(db, tenantId, emitRequest, correlationId);
  } catch (err) {
    if (err instanceof DuplicateIdempotencyError) {
      await markChannelSessionEmitted(db, tenantId, sessionId, err.issueId);
      const [existing] = await db<{ status: string }[]>`
        SELECT status FROM exeq_core.nf_issue
        WHERE tenant_id = ${tenantId}::uuid AND id = ${err.issueId}::uuid
      `;
      return {
        session_id: sessionId,
        issue_id: err.issueId,
        status: existing!.status,
        duplicate: true,
      };
    }
    throw err;
  }

  await markChannelSessionEmitted(db, tenantId, sessionId, issue.id);

  return {
    session_id: sessionId,
    issue_id: issue.id,
    status: issue.status,
    duplicate: false,
  };
}

export async function maybeEnqueueChannelNotification(
  db: Sql,
  tenantId: string,
  issueId: string,
  toStatus: NfIssueStatus,
): Promise<void> {
  if (!isTerminalNfIssueStatus(toStatus)) return;

  const eventMap: Partial<Record<NfIssueStatus, ChannelNotificationEvent>> = {
    authorized: "nf.authorized",
    rejected: "nf.rejected",
    cancelled: "nf.cancelled",
    failed: "nf.failed",
  };
  const eventType = eventMap[toStatus];
  if (!eventType) return;

  const [issue] = await db<{
    idempotency_key: string;
    focus_ref: string | null;
    nfse_provider_kind: string | null;
  }[]>`
    SELECT idempotency_key, focus_ref, nfse_provider_kind::text AS nfse_provider_kind
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid AND id = ${issueId}::uuid
  `;
  if (!issue) return;

  const session = await findChannelSessionByIdempotency(db, tenantId, issue.idempotency_key);
  if (!session) return;
  if (!isChannelPhoneAllowed(session.phone_e164)) return;

  const [existing] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.channel_notification
    WHERE tenant_id = ${tenantId}::uuid
      AND nf_issue_id = ${issueId}::uuid
      AND event_type = ${eventType}
    LIMIT 1
  `;
  if (existing) return;

  const messageBody = buildChannelStatusMessage(eventType, {
    issue_id: issueId,
    focus_ref: issue.focus_ref,
    nfse_provider_kind: issue.nfse_provider_kind,
  });

  await createChannelNotification(db, tenantId, {
    session_id: session.id,
    nf_issue_id: issueId,
    phone_e164: session.phone_e164,
    event_type: eventType,
    message_body: messageBody,
  });
}
