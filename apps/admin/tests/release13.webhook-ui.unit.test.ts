import { describe, expect, it } from "vitest";
import { buildWebhooksQuery, formatWebhookStatus } from "../src/lib/webhook-ui.js";

describe("Release 1.3 — webhook UI", () => {
  it("buildWebhooksQuery com status e cursor", () => {
    const q = buildWebhooksQuery({ status: "failed", cursor: "abc" });
    expect(q.status).toBe("failed");
    expect(q.cursor).toBe("abc");
    expect(q.limit).toBe("50");
  });

  it("formata status failed em português", () => {
    expect(formatWebhookStatus("failed")).toBe("Falha");
  });
});
