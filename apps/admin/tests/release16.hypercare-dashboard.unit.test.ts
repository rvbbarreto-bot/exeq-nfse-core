import { describe, expect, it } from "vitest";
import {
  buildOpsAlertCards,
  hasActiveAlerts,
  hypercareAlertTotal,
} from "../src/lib/ops-alerts.js";

describe("Sprint 16 — hypercare dashboard", () => {
  const empty = {
    issues_failed: 0,
    issues_queued: 0,
    webhooks_failed: 0,
    charges_pending: 0,
    charges_registered: 0,
  };

  it("expõe fila failed e cobranças pending/registered", () => {
    const cards = buildOpsAlertCards({
      issues_failed: 1,
      issues_queued: 2,
      webhooks_failed: 0,
      charges_pending: 3,
      charges_registered: 4,
    });
    expect(cards.find((c) => c.key === "issues_failed")?.href).toBe("/issues?status=failed");
    expect(cards.find((c) => c.key === "charges_pending")?.href).toBe("/charges?status=pending");
    expect(cards.find((c) => c.key === "charges_registered")?.href).toBe(
      "/charges?status=registered",
    );
    expect(hypercareAlertTotal({ ...empty, issues_failed: 1, charges_registered: 2 })).toBe(3);
  });

  it("sem alertas quando tudo zerado", () => {
    expect(hasActiveAlerts(empty)).toBe(false);
    expect(buildOpsAlertCards(empty)).toHaveLength(5);
  });
});
