import { describe, expect, it } from "vitest";
import { buildOpsAlertCards, hasActiveAlerts } from "../src/lib/ops-alerts.js";

const empty = {
  issues_failed: 0,
  issues_queued: 0,
  webhooks_failed: 0,
  charges_pending: 0,
  charges_registered: 0,
};

describe("Release 1.5 / Sprint 16 — ops alerts UI", () => {
  it("OP-06: cards críticos quando há falhas", () => {
    const cards = buildOpsAlertCards({
      ...empty,
      issues_failed: 2,
      webhooks_failed: 1,
    });
    const issues = cards.find((c) => c.key === "issues_failed");
    expect(issues?.severity).toBe("critical");
    expect(issues?.href).toBe("/issues?status=failed");
    expect(hasActiveAlerts({ ...empty, issues_failed: 2 })).toBe(true);
  });

  it("OP-06: cobranças pending e registered em warning", () => {
    const cards = buildOpsAlertCards({
      ...empty,
      charges_pending: 2,
      charges_registered: 5,
    });
    expect(cards.find((c) => c.key === "charges_pending")?.severity).toBe("warning");
    expect(cards.find((c) => c.key === "charges_registered")?.href).toBe(
      "/charges?status=registered",
    );
    expect(hasActiveAlerts(empty)).toBe(false);
  });
});
