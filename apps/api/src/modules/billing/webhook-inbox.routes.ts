import type { FastifyInstance } from "fastify";
import { listWebhookInboxQuerySchema } from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { NotFoundError } from "../master-data/master-data.service.js";
import {
  reprocessWebhookInbox,
  WebhookInboxNotReprocessableError,
} from "./reprocess-webhook-inbox.use-case.js";
import {
  exportWebhookInboxesCsv,
  getWebhookInboxDetail,
  listWebhookInboxes,
} from "./webhook-inbox.service.js";
import { WRITE_ROLES } from "../../plugins/rbac.js";

export async function webhookInboxRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authWrite = { preHandler: [app.authenticate, app.requireRoles(...WRITE_ROLES)] };

  app.get("/v1/webhooks/inbox/export", auth, async (request, reply) => {
    const query = listWebhookInboxQuerySchema.parse(request.query);
    try {
      const csv = await withTenant(request.user.tenant_id, (db) =>
        exportWebhookInboxesCsv(db, request.user.tenant_id, query),
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="webhooks-inbox.csv"')
        .send(csv);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/webhooks/inbox", auth, async (request, reply) => {
    const query = listWebhookInboxQuerySchema.parse(request.query);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        listWebhookInboxes(db, request.user.tenant_id, query),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/webhooks/inbox/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const row = await withTenant(request.user.tenant_id, (db) =>
        getWebhookInboxDetail(db, request.user.tenant_id, id),
      );
      if (!row) {
        return reply.code(404).send({ error: "WEBHOOK_INBOX_NOT_FOUND" });
      }
      return row;
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/webhooks/inbox/:id/reprocess", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        reprocessWebhookInbox(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (err instanceof WebhookInboxNotReprocessableError) {
        return reply.code(409).send({
          error: err.message,
          message: "Webhook ja processado com sucesso",
        });
      }
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: "WEBHOOK_INBOX_NOT_FOUND" });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
