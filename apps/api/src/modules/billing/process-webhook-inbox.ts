import { gatewayWebhookPayloadSchema } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { appendAuditLog } from "../issuance/nf-issue.service.js";
import {
  findChargeForReconciliation,
  transitionCharge,
} from "./charge.service.js";
import {
  getWebhookInboxPayload,
  markWebhookInboxFailed,
  markWebhookInboxProcessed,
  markWebhookInboxProcessing,
} from "./webhook-inbox.service.js";

export class WebhookReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookReconciliationError";
  }
}

export async function processWebhookInbox(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<{ charge_id?: string; status: string }> {
  const inbox = await getWebhookInboxPayload(db, tenantId, inboxId);
  if (inbox.status === "processed") {
    return { status: "already_processed" };
  }

  await markWebhookInboxProcessing(db, tenantId, inboxId);

  try {
    const payload = gatewayWebhookPayloadSchema.parse(inbox.raw_payload);

    if (payload.event === "payment.failed") {
      const charge = await findChargeForReconciliation(
        db,
        tenantId,
        payload.charge_id,
        payload.gateway_ref,
      );
      if (charge && charge.status !== "paid") {
        await transitionCharge(db, tenantId, charge.id, "failed", {
          gateway_ref: payload.gateway_ref,
        });
      }
      await markWebhookInboxProcessed(db, tenantId, inboxId);
      return { charge_id: charge?.id, status: "failed" };
    }

    const charge = await findChargeForReconciliation(
      db,
      tenantId,
      payload.charge_id,
      payload.gateway_ref,
    );
    if (!charge) {
      throw new WebhookReconciliationError("CHARGE_NOT_FOUND");
    }
    if (charge.status === "paid") {
      await markWebhookInboxProcessed(db, tenantId, inboxId);
      return { charge_id: charge.id, status: "already_paid" };
    }
    if (charge.amount_cents !== payload.amount_cents) {
      throw new WebhookReconciliationError("AMOUNT_MISMATCH");
    }

    const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();

    await db`
      INSERT INTO exeq_core.payment_event (
        tenant_id, charge_id, webhook_inbox_id, amount_cents, paid_at, gateway_ref, metadata
      ) VALUES (
        ${tenantId}::uuid, ${charge.id}::uuid, ${inboxId}::uuid,
        ${payload.amount_cents}, ${paidAt.toISOString()}::timestamptz,
        ${payload.gateway_ref ?? null}, ${db.json(payload)}
      )
    `;

    await transitionCharge(db, tenantId, charge.id, "paid", {
      gateway_ref: payload.gateway_ref,
    });

    await appendAuditLog(db, tenantId, "charge", charge.id, "payment_reconciled", null, {
      inbox_id: inboxId,
      amount_cents: payload.amount_cents,
    });

    await markWebhookInboxProcessed(db, tenantId, inboxId);
    return { charge_id: charge.id, status: "paid" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "WEBHOOK_PROCESS_FAILED";
    await markWebhookInboxFailed(db, tenantId, inboxId, message);
    throw err;
  }
}

export async function processWebhookInboxUntilTerminal(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<{ charge_id?: string; status: string }> {
  return processWebhookInbox(db, tenantId, inboxId);
}
