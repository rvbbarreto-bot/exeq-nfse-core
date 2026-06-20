import type { Sql } from "../../db/client.js";
import { env } from "../../config/env.js";
import { enqueueWebhookProcessing } from "../../workers/queues.js";
import {
  createWebhookInbox,
  DuplicateWebhookInboxError,
} from "./webhook-inbox.service.js";
import { processWebhookInboxUntilTerminal, WebhookReconciliationError } from "./process-webhook-inbox.js";

export async function receiveGatewayWebhook(
  db: Sql,
  tenantId: string,
  idempotencyKey: string,
  rawPayload: unknown,
  signature: string | null,
): Promise<{ inbox_id: string; status: string; duplicate: boolean }> {
  try {
    const inbox = await createWebhookInbox(db, tenantId, idempotencyKey, rawPayload, signature);

    if (env.WEBHOOK_SYNC_PROCESSING) {
      try {
        const result = await processWebhookInboxUntilTerminal(db, tenantId, inbox.id);
        return {
          inbox_id: inbox.id,
          status: result.status,
          duplicate: false,
        };
      } catch (err) {
        if (err instanceof WebhookReconciliationError) {
          return { inbox_id: inbox.id, status: "failed", duplicate: false };
        }
        throw err;
      }
    }

    await enqueueWebhookProcessing({ tenantId, inboxId: inbox.id });
    return { inbox_id: inbox.id, status: "received", duplicate: false };
  } catch (err) {
    if (err instanceof DuplicateWebhookInboxError) {
      if (env.WEBHOOK_SYNC_PROCESSING) {
        await processWebhookInboxUntilTerminal(db, tenantId, err.inboxId);
      }
      return {
        inbox_id: err.inboxId,
        status: err.status,
        duplicate: true,
      };
    }
    throw err;
  }
}
