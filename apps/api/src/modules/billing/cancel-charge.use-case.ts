import type { Sql } from "../../db/client.js";
import { getPaymentGatewayClient } from "../integration/gateway/payment-gateway.client.js";
import { getTenantSecret } from "../platform/secret-vault.service.js";
import { appendAuditLog } from "../issuance/nf-issue.service.js";
import {
  ChargeNotCancellableError,
  getChargeDetail,
  transitionCharge,
} from "./charge.service.js";

export async function cancelCharge(db: Sql, tenantId: string, chargeId: string) {
  const detail = await getChargeDetail(db, tenantId, chargeId);
  if (!["pending", "registered"].includes(detail.status)) {
    throw new ChargeNotCancellableError(detail.status);
  }

  if (detail.gateway_ref) {
    const apiKey = await getTenantSecret(db, tenantId, "gateway_key");
    if (apiKey) {
      try {
        await getPaymentGatewayClient().cancelCharge(apiKey, detail.gateway_ref);
      } catch {
        // Cancelamento local segue mesmo se o gateway estiver indisponível.
      }
    }
  }

  await transitionCharge(db, tenantId, chargeId, "cancelled");
  await appendAuditLog(db, tenantId, "charge", chargeId, "cancelled", null);

  return getChargeDetail(db, tenantId, chargeId);
}
