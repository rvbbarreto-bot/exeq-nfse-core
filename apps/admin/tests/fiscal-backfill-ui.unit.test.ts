import { describe, expect, it, vi } from "vitest";
import { canRunFiscalBackfill, formatBackfillSummary } from "../src/lib/fiscal-backfill-ui.js";

vi.mock("../src/lib/auth.js", () => ({
  getUserRoles: vi.fn(() => ["tenant_admin"]),
}));

describe("fiscal-backfill-ui", () => {
  it("canRunFiscalBackfill — tenant_admin permitido", () => {
    expect(canRunFiscalBackfill()).toBe(true);
  });

  it("formatBackfillSummary — dry-run legivel", () => {
    const text = formatBackfillSummary({
      tenant_id: "t1",
      tenant_slug: "piloto-sp",
      days: 90,
      candidates: 15,
      created: 15,
      skipped: 0,
      errors: 0,
      dry_run: true,
    });
    expect(text).toContain("Simulacao");
    expect(text).toContain("15 candidatos");
  });
});
