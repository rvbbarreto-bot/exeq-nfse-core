import { describe, expect, it } from "vitest";
import {
  assertChargeTransition,
  canTransitionCharge,
  inferGatewayIntegrationMode,
  InvalidChargeTransitionError,
  isTerminalChargeStatus,
} from "../src/billing.js";
import { gatewayWebhookPayloadSchema } from "../src/webhook-inbox.js";

describe("Charge state machine", () => {
  it("permite pending -> paid", () => {
    expect(canTransitionCharge("pending", "paid")).toBe(true);
    expect(canTransitionCharge("registered", "paid")).toBe(true);
  });

  it("bloqueia transicao invalida", () => {
    expect(() => assertChargeTransition("paid", "pending")).toThrow(
      InvalidChargeTransitionError,
    );
  });

  it("identifica status terminal", () => {
    expect(isTerminalChargeStatus("paid")).toBe(true);
    expect(isTerminalChargeStatus("pending")).toBe(false);
  });
});

describe("inferGatewayIntegrationMode", () => {
  it("classifica mock e http pela referência", () => {
    expect(inferGatewayIntegrationMode("mock-abc")).toBe("mock");
    expect(inferGatewayIntegrationMode("gw-uat-sandbox-001")).toBe("http");
    expect(inferGatewayIntegrationMode(null)).toBeNull();
  });
});

describe("gatewayWebhookPayloadSchema", () => {
  it("exige charge_id ou gateway_ref", () => {
    const ok = gatewayWebhookPayloadSchema.safeParse({
      idempotency_key: "wh-test-001",
      event: "payment.paid",
      charge_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 10000,
    });
    expect(ok.success).toBe(true);

    const bad = gatewayWebhookPayloadSchema.safeParse({
      idempotency_key: "wh-test-002",
      event: "payment.paid",
      amount_cents: 10000,
    });
    expect(bad.success).toBe(false);
  });
});
