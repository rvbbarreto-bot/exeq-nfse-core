export const PILOT_CHANNEL_TOKEN = "sandbox-channel-token-piloto";
export { PILOT_TENANT_SLUG } from "./billing-setup.js";

export function channelHeaders(extra: Record<string, string> = {}) {
  return {
    "x-tenant-slug": "piloto-sp",
    "x-channel-token": PILOT_CHANNEL_TOKEN,
    ...extra,
  };
}

export async function findChannelNotificationForIssue(
  tenantId: string,
  issueId: string,
): Promise<{ id: string; event_type: string; status: string; message_body: string } | null> {
  const { withTenant } = await import("../../src/db/client.js");
  const [row] = await withTenant(tenantId, (db) =>
    db<{ id: string; event_type: string; status: string; message_body: string }[]>`
      SELECT id, event_type, status, message_body
      FROM exeq_core.channel_notification
      WHERE tenant_id = ${tenantId}::uuid AND nf_issue_id = ${issueId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );
  return row ?? null;
}
