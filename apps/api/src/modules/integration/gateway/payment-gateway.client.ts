import { env } from "../../../config/env.js";
import type { PaymentGatewayClient } from "./payment-gateway.adapter.js";
import { HttpPaymentGatewayClient } from "./http-payment-gateway.client.js";
import { MockPaymentGatewayClient } from "./mock-payment-gateway.client.js";

export type { PaymentGatewayClient } from "./payment-gateway.adapter.js";

const MOCK_SANDBOX_BASE = "https://sandbox.exeq.local/pay";

/** Lê flag booleana em runtime (vitest define GATEWAY_* após import de env). */
function runtimeEnvFlag(name: "GATEWAY_MOCK" | "GATEWAY_SYNC_PROCESSING", fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

export function buildMockGatewaySandboxUrl(gatewayRef: string): string {
  return `${MOCK_SANDBOX_BASE}/${encodeURIComponent(gatewayRef)}`;
}

export function resolveGatewaySandboxUrl(gatewayRef: string | null): string | null {
  if (!gatewayRef) return null;
  if (runtimeEnvFlag("GATEWAY_MOCK", env.GATEWAY_MOCK) && gatewayRef.startsWith("mock-")) {
    return buildMockGatewaySandboxUrl(gatewayRef);
  }
  return null;
}

let gatewayClientSingleton: PaymentGatewayClient | null = null;

export function getPaymentGatewayClient(): PaymentGatewayClient {
  if (!gatewayClientSingleton) {
    gatewayClientSingleton = runtimeEnvFlag("GATEWAY_MOCK", env.GATEWAY_MOCK)
      ? new MockPaymentGatewayClient()
      : new HttpPaymentGatewayClient();
  }
  return gatewayClientSingleton;
}

export function setPaymentGatewayClient(client: PaymentGatewayClient | null): void {
  gatewayClientSingleton = client;
}

export function shouldRegisterChargeAtGateway(): boolean {
  return runtimeEnvFlag("GATEWAY_SYNC_PROCESSING", env.GATEWAY_SYNC_PROCESSING);
}
