import type {
  GatewayCreateChargeInput,
  GatewayCreateChargeResult,
  PaymentGatewayClient,
} from "./payment-gateway.adapter.js";

const MOCK_SANDBOX_BASE = "https://sandbox.exeq.local/pay";

function buildMockGatewaySandboxUrl(gatewayRef: string): string {
  return `${MOCK_SANDBOX_BASE}/${encodeURIComponent(gatewayRef)}`;
}

type StoredCharge = GatewayCreateChargeResult & { charge_id: string };

/** Mock sandbox — dev/CI (`GATEWAY_MOCK=true`). */
export class MockPaymentGatewayClient implements PaymentGatewayClient {
  private readonly byIdempotency = new Map<string, StoredCharge>();

  async createCharge(
    _apiKey: string,
    input: GatewayCreateChargeInput,
  ): Promise<GatewayCreateChargeResult> {
    const existing = this.byIdempotency.get(input.idempotency_key);
    if (existing) {
      return {
        gateway_ref: existing.gateway_ref,
        sandbox_payment_url: existing.sandbox_payment_url,
        barcode: existing.barcode,
      };
    }

    const gateway_ref = `mock-${input.charge_id.replace(/-/g, "").slice(0, 12)}`;
    const result: StoredCharge = {
      charge_id: input.charge_id,
      gateway_ref,
      sandbox_payment_url: buildMockGatewaySandboxUrl(gateway_ref),
      barcode: `34191.79001 01043.510047 91020.150008 4 84410026000${String(input.amount_cents).padStart(8, "0")}`,
    };
    this.byIdempotency.set(input.idempotency_key, result);
    return result;
  }

  async cancelCharge(_apiKey: string, gatewayRef: string): Promise<void> {
    for (const [key, value] of this.byIdempotency) {
      if (value.gateway_ref === gatewayRef) {
        this.byIdempotency.delete(key);
        return;
      }
    }
  }
}
