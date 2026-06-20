import { env } from "../../../config/env.js";
import type {
  GatewayCreateChargeInput,
  GatewayCreateChargeResult,
  PaymentGatewayClient,
} from "./payment-gateway.adapter.js";
import { mapGatewayHttpError } from "./gateway-error-mapper.js";

export class HttpPaymentGatewayClient implements PaymentGatewayClient {
  private authHeader(apiKey: string): string {
    return `Bearer ${apiKey}`;
  }

  async createCharge(
    apiKey: string,
    input: GatewayCreateChargeInput,
  ): Promise<GatewayCreateChargeResult> {
    const url = `${env.GATEWAY_BASE_URL}/v1/charges`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(apiKey),
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotency_key,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        external_id: input.charge_id,
        amount_cents: input.amount_cents,
        due_date: input.due_date,
        description: input.description ?? undefined,
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const op = mapGatewayHttpError(res.status, raw);
      throw new Error(`${op.code}:${op.detail}`);
    }
    const body = raw as {
      id?: string;
      gateway_ref?: string;
      payment_url?: string;
      barcode?: string;
    };
    const gateway_ref = body.gateway_ref ?? body.id;
    if (!gateway_ref) {
      throw new Error("GATEWAY_INVALID_RESPONSE:Resposta sem gateway_ref");
    }
    return {
      gateway_ref,
      sandbox_payment_url: body.payment_url,
      barcode: body.barcode,
    };
  }

  async cancelCharge(apiKey: string, gatewayRef: string): Promise<void> {
    const url = `${env.GATEWAY_BASE_URL}/v1/charges/${encodeURIComponent(gatewayRef)}/cancel`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: this.authHeader(apiKey) },
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const op = mapGatewayHttpError(res.status, raw);
      throw new Error(`${op.code}:${op.detail}`);
    }
  }
}
