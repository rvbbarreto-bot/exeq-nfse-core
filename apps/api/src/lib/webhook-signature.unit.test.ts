import { describe, expect, it } from "vitest";
import { computeWebhookSignature, verifyWebhookSignature } from "./webhook-signature.js";

describe("webhook-signature", () => {
  it("computa e valida assinatura HMAC", () => {
    const body = JSON.stringify({ event: "payment.paid", amount_cents: 1000 });
    const sig = computeWebhookSignature(body, "test-secret");
    expect(verifyWebhookSignature(body, "test-secret", sig)).toBe(true);
    expect(verifyWebhookSignature(body, "wrong-secret", sig)).toBe(false);
  });

  it("rejeita assinatura ausente", () => {
    expect(verifyWebhookSignature("{}", "secret", undefined)).toBe(false);
  });
});
