import { describe, expect, it } from "vitest";
import {
  buildLinkedChargeIdempotencyKey,
  defaultChargeDueDate,
  hasActiveLinkedCharge,
} from "../src/lib/issue-linked-charge.js";

describe("Sprint 12 — cobrança vinculada à emissão", () => {
  it("detecta cobrança ativa vinculada", () => {
    expect(hasActiveLinkedCharge([{ status: "registered" }])).toBe(true);
    expect(hasActiveLinkedCharge([{ status: "cancelled" }])).toBe(false);
    expect(hasActiveLinkedCharge([{ status: "failed" }, { status: "paid" }])).toBe(true);
  });

  it("gera vencimento +30 dias", () => {
    expect(defaultChargeDueDate(new Date("2026-05-01T12:00:00Z"))).toBe("2026-05-31");
  });

  it("idempotency key única por clique", () => {
    const issueId = "00000000-0000-0000-0000-000000000001";
    const a = buildLinkedChargeIdempotencyKey(issueId);
    const b = buildLinkedChargeIdempotencyKey(issueId);
    expect(a).toMatch(/^admin-issue-000000000000-\d+-[a-f0-9]{8}$/);
    expect(b).toMatch(/^admin-issue-000000000000-\d+-[a-f0-9]{8}$/);
    expect(a).not.toBe(b);
  });
});
