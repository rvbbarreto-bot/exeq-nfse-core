import { describe, expect, it } from "vitest";
import { buildChargeDashboardKpis } from "../src/lib/charge-dashboard.js";
import {
  buildChargesQuery,
  canCancelCharge,
  canReprocessWebhookInbox,
  chargeStatusClass,
  formatChargeStatus,
} from "../src/lib/charge-ui.js";

describe("Release 1.1 — admin cobrança", () => {
  it("RC-01: formata status e query de listagem", () => {
    expect(formatChargeStatus("registered")).toBe("Registrada");
    expect(formatChargeStatus("paid")).toBe("Paga");
    expect(chargeStatusClass("failed")).toBe("err");
    expect(buildChargesQuery({ status: "pending", limit: "50" })).toEqual({
      status: "pending",
      limit: "50",
    });
  });

  it("RC-03: cancelamento apenas pending/registered", () => {
    expect(canCancelCharge("pending")).toBe(true);
    expect(canCancelCharge("paid")).toBe(false);
  });

  it("RC-04: reprocess webhook para failed/received", () => {
    expect(canReprocessWebhookInbox("failed")).toBe(true);
    expect(canReprocessWebhookInbox("processed")).toBe(false);
  });

  it("RC-06: KPIs cobrança no dashboard", () => {
    const kpis = buildChargeDashboardKpis({
      total: 10,
      pending: 3,
      paid_last_7_days: 4,
      failed_last_7_days: 1,
    });
    expect(kpis.find((k) => k.key === "pending")?.value).toBe(3);
    expect(kpis.find((k) => k.key === "paid_7d")?.filterStatus).toBe("paid");
  });
});
