import type { Sql } from "../../db/client.js";

export async function listRecentChannelSessions(db: Sql, tenantId: string, limit = 30) {
  return db`
    SELECT id, status, phone_e164, idempotency_key, nf_issue_id,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM exeq_core.channel_session
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function listRecentChannelNotifications(db: Sql, tenantId: string, limit = 30) {
  return db`
    SELECT id, status, phone_e164, event_type, nf_issue_id, session_id,
           left(message_body, 120) AS message_preview,
           created_at::text AS created_at, sent_at::text AS sent_at
    FROM exeq_core.channel_notification
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
