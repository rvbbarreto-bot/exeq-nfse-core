import type { ChargeStats } from "../api/client.js";

export type ChargeKpi = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  filterStatus?: string;
};

export function buildChargeDashboardKpis(stats: ChargeStats): ChargeKpi[] {
  return [
    {
      key: "pending",
      label: "Cobranças pendentes",
      value: stats.pending,
      hint: "ok",
      filterStatus: "pending",
    },
    {
      key: "paid_7d",
      label: "Pagas (7 dias)",
      value: stats.paid_last_7_days,
      filterStatus: "paid",
    },
    {
      key: "failed_7d",
      label: "Falhas / canceladas (7 dias)",
      value: stats.failed_last_7_days,
      hint: "err",
      filterStatus: "failed",
    },
    {
      key: "total",
      label: "Total cobranças",
      value: stats.total,
    },
  ];
}
