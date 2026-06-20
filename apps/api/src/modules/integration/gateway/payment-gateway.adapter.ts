export type GatewayCreateChargeInput = {
  charge_id: string;
  idempotency_key: string;
  amount_cents: number;
  due_date: string;
  description?: string | null;
};

export type GatewayCreateChargeResult = {
  gateway_ref: string;
  sandbox_payment_url?: string;
  barcode?: string;
};

export interface PaymentGatewayClient {
  createCharge(apiKey: string, input: GatewayCreateChargeInput): Promise<GatewayCreateChargeResult>;
  cancelCharge(apiKey: string, gatewayRef: string): Promise<void>;
}
