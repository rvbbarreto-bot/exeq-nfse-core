import type { Sql } from "../../db/client.js";
import { getChargeStats } from "../billing/charge.service.js";
import { getNfIssueStats } from "../issuance/nf-issue.service.js";
import { getOpsAlerts, type OpsAlerts } from "./ops-alerts.service.js";

export type OpsSummary = {
  alerts: OpsAlerts;
  issue_stats: Awaited<ReturnType<typeof getNfIssueStats>>;
  charge_stats: Awaited<ReturnType<typeof getChargeStats>>;
};

export async function getOpsSummary(db: Sql, tenantId: string): Promise<OpsSummary> {
  const [alerts, issue_stats, charge_stats] = await Promise.all([
    getOpsAlerts(db, tenantId),
    getNfIssueStats(db, tenantId),
    getChargeStats(db, tenantId),
  ]);
  return { alerts, issue_stats, charge_stats };
}
