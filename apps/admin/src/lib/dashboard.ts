import type { NfIssueStatus } from "./issue-ui.js";

export type IssueStats = {
  total: number;
  by_status: Record<string, number>;
  last_7_days: number;
  pilot_municipios: { ibge_code: string; label: string; count: number }[];
};

export type DashboardKpi = {
  key: string;
  label: string;
  value: number;
  hint?: string;
};

export function buildDashboardKpis(stats: IssueStats): DashboardKpi[] {
  const authorized = stats.by_status.authorized ?? 0;
  const failed = stats.by_status.failed ?? 0;
  const rejected = stats.by_status.rejected ?? 0;
  const inProgress =
    (stats.by_status.queued ?? 0) +
    (stats.by_status.submitting ?? 0) +
    (stats.by_status.polling ?? 0);

  return [
    { key: "total", label: "Total emissoes", value: stats.total },
    { key: "last7", label: "Ultimos 7 dias", value: stats.last_7_days },
    { key: "authorized", label: "Autorizadas", value: authorized, hint: "status-ok" },
    { key: "in_progress", label: "Em processamento", value: inProgress, hint: "status-progress" },
    { key: "failed", label: "Com falha", value: failed, hint: "status-error" },
    { key: "rejected", label: "Rejeitadas", value: rejected, hint: "status-error" },
  ];
}

export function topStatusBreakdown(
  stats: IssueStats,
  limit = 5,
): { status: NfIssueStatus | string; count: number }[] {
  return Object.entries(stats.by_status)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([status, count]) => ({ status, count }));
}
