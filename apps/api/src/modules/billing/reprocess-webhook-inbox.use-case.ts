import type { WebhookInboxStatus } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { NotFoundError } from "../master-data/master-data.service.js";
import { enqueueWebhookProcessing } from "../../workers/queues.js";
import { getWebhookInboxDetail, resetWebhookInboxForReprocess } from "./webhook-inbox.service.js";

export class WebhookInboxNotReprocessableError extends Error {
  constructor(readonly status: WebhookInboxStatus) {
    super("WEBHOOK_INBOX_NOT_REPROCESSABLE");
    this.name = "WebhookInboxNotReprocessableError";
  }
}

export async function reprocessWebhookInbox(
  db: Sql,
  tenantId: string,
  inboxId: string,
): Promise<{ inbox_id: string; status: string }> {
  const inbox = await getWebhookInboxDetail(db, tenantId, inboxId);
  if (!inbox) throw new NotFoundError("WEBHOOK_INBOX");

  if (inbox.status === "processed") {
    throw new WebhookInboxNotReprocessableError(inbox.status);
  }

  if (inbox.status === "failed") {
    await resetWebhookInboxForReprocess(db, tenantId, inboxId);
  }

  await enqueueWebhookProcessing({ tenantId, inboxId });
  return { inbox_id: inboxId, status: "queued" };
}
