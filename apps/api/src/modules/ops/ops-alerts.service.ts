import type { Sql } from "../../db/client.js";

export type OpsAlerts = {
  issues_failed: number;
  issues_queued: number;
  webhooks_failed: number;
  charges_pending: number;
  charges_registered: number;
};

export async function getOpsAlerts(db: Sql, tenantId: string): Promise<OpsAlerts> {
  const [issuesFailedRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'failed'::exeq_core.nf_issue_status
  `;

  const [issuesQueuedRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.nf_issue
    WHERE tenant_id = ${tenantId}::uuid
      AND status IN (
        'queued'::exeq_core.nf_issue_status,
        'polling'::exeq_core.nf_issue_status
      )
  `;

  const [webhooksRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.webhook_inbox
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'failed'::exeq_core.webhook_inbox_status
  `;

  const [chargesPendingRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'pending'::exeq_core.charge_status
  `;

  const [chargesRegisteredRow] = await db<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM exeq_core.charge
    WHERE tenant_id = ${tenantId}::uuid
      AND status = 'registered'::exeq_core.charge_status
  `;

  return {
    issues_failed: Number(issuesFailedRow?.count ?? 0),
    issues_queued: Number(issuesQueuedRow?.count ?? 0),
    webhooks_failed: Number(webhooksRow?.count ?? 0),
    charges_pending: Number(chargesPendingRow?.count ?? 0),
    charges_registered: Number(chargesRegisteredRow?.count ?? 0),
  };}
