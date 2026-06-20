import { describe, expect, it } from "vitest";
import { buildDashboardKpis, topStatusBreakdown } from "../src/lib/dashboard.js";

describe("dashboard", () => {
  const stats = {
    total: 10,
    by_status: {
      authorized: 5,
      failed: 1,
      rejected: 2,
      queued: 1,
      submitting: 0,
      polling: 1,
      draft: 0,
      pending_tax: 0,
      cancelled: 0,
    },
    last_7_days: 4,
    pilot_municipios: [],
  };

  it("monta KPIs principais", () => {
    const kpis = buildDashboardKpis(stats);
    expect(kpis.find((k) => k.key === "authorized")?.value).toBe(5);
    expect(kpis.find((k) => k.key === "in_progress")?.value).toBe(2);
  });

  it("ordena breakdown por volume", () => {
    const rows = topStatusBreakdown(stats, 3);
    expect(rows[0]?.status).toBe("authorized");
    expect(rows[0]?.count).toBe(5);
  });

  it("ignora status zerados no breakdown", () => {
    const sparse = {
      ...stats,
      by_status: { authorized: 2, failed: 0, rejected: 1 },
    };
    const rows = topStatusBreakdown(sparse, 5);
    expect(rows).toHaveLength(2);
  });

  it("KPIs com campos ausentes tratam zero", () => {
    const kpis = buildDashboardKpis({
      total: 0,
      by_status: {},
      last_7_days: 0,
      pilot_municipios: [],
    });
    expect(kpis.find((k) => k.key === "failed")?.value).toBe(0);
  });
});
