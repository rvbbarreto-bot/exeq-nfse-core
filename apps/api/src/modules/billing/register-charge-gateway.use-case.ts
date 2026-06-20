import type { Sql } from "../../db/client.js";
import {
  mapGatewayCredentialError,
  mapGatewayTransportError,
} from "../integration/gateway/gateway-error-mapper.js";
import type { OperatorMessage } from "../integration/focus/focus-error-mapper.js";
import { getPaymentGatewayClient } from "../integration/gateway/payment-gateway.client.js";
import { getTenantSecret } from "../platform/secret-vault.service.js";
import { appendAuditLog } from "../issuance/nf-issue.service.js";
import type { createCharge } from "./charge.service.js";
import { transitionCharge } from "./charge.service.js";

type ChargeRow = Awaited<ReturnType<typeof createCharge>>;

export class GatewayCredentialError extends Error {
  readonly operator: OperatorMessage;

  constructor() {
    super("GATEWAY_CREDENTIAL_MISSING");
    this.name = "GatewayCredentialError";
    this.operator = mapGatewayCredentialError();
  }
}

export class GatewayRegistrationError extends Error {
  readonly operator: OperatorMessage;

  constructor(operator: OperatorMessage) {
    super("GATEWAY_REGISTRATION_FAILED");
    this.name = "GatewayRegistrationError";
    this.operator = operator;
  }
}

function parseGatewayClientError(err: unknown): OperatorMessage {
  if (err instanceof Error && err.message.includes(":")) {
    const [code, ...rest] = err.message.split(":");
    return {
      code,
      title: "Erro no gateway de cobrança",
      detail: rest.join(":") || err.message,
      action: "Revise credenciais e dados da cobrança.",
    };
  }
  return mapGatewayTransportError(err);
}

export async function registerChargeAtGateway(
  db: Sql,
  tenantId: string,
  charge: ChargeRow,
): Promise<ChargeRow> {
  if (charge.status === "registered" && charge.gateway_ref) {
    return charge;
  }
  if (charge.status !== "pending") {
    return charge;
  }

  const apiKey = await getTenantSecret(db, tenantId, "gateway_key");
  if (!apiKey) {
    throw new GatewayCredentialError();
  }

  const client = getPaymentGatewayClient();
  try {
    const result = await client.createCharge(apiKey, {
      charge_id: charge.id,
      idempotency_key: charge.idempotency_key,
      amount_cents: Number(charge.amount_cents),
      due_date: charge.due_date,
      description: charge.description,
    });

    const row = await transitionCharge(db, tenantId, charge.id, "registered", {
      gateway_ref: result.gateway_ref,
      gateway_payment_url: result.sandbox_payment_url ?? null,
    });

    await appendAuditLog(db, tenantId, "charge", charge.id, "gateway_registered", null, {
      gateway_ref: result.gateway_ref,
    });

    return row;
  } catch (err) {
    const operator = parseGatewayClientError(err);
    await transitionCharge(db, tenantId, charge.id, "failed");
    await appendAuditLog(db, tenantId, "charge", charge.id, "gateway_registration_failed", null, {
      code: operator.code,
      detail: operator.detail,
    });
    throw new GatewayRegistrationError(operator);
  }
}
