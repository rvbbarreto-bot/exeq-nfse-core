import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { gatewayWebhookPayloadSchema } from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { verifyWebhookSignature } from "../../lib/webhook-signature.js";
import { getTenantSecret } from "../platform/secret-vault.service.js";
import { resolveTenantIdBySlug, TenantNotFoundError } from "../platform/tenant-resolver.js";
import { receiveGatewayWebhook } from "./receive-webhook.use-case.js";

type WebhookRequest = FastifyRequest & { rawBody?: string };

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!request.url.startsWith("/v1/webhooks/gateway/")) {
      return payload;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks);
    (request as WebhookRequest).rawBody = raw.toString("utf8");
    return Readable.from([raw]);
  });

  app.post("/v1/webhooks/gateway/:tenantSlug", async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const signature = request.headers["x-webhook-signature"];
    const rawBody = (request as WebhookRequest).rawBody ?? JSON.stringify(request.body);

    let tenantId: string;
    try {
      tenantId = await resolveTenantIdBySlug(tenantSlug);
    } catch (err) {
      if (err instanceof TenantNotFoundError) {
        return reply.code(404).send({ error: "TENANT_NOT_FOUND", message: "Tenant nao encontrado" });
      }
      throw err;
    }

    const secret = await withTenant(tenantId, (db) =>
      getTenantSecret(db, tenantId, "webhook_secret"),
    );
    if (!secret) {
      return reply.code(422).send({
        error: "WEBHOOK_SECRET_MISSING",
        message: "Segredo webhook nao configurado para o tenant",
      });
    }

    if (!verifyWebhookSignature(rawBody, secret, typeof signature === "string" ? signature : undefined)) {
      return reply.code(401).send({
        error: "INVALID_WEBHOOK_SIGNATURE",
        message: "Assinatura webhook invalida",
      });
    }

    const payload = gatewayWebhookPayloadSchema.parse(JSON.parse(rawBody));

    try {
      const result = await withTenant(tenantId, (db) =>
        receiveGatewayWebhook(
          db,
          tenantId,
          payload.idempotency_key,
          payload,
          typeof signature === "string" ? signature : null,
        ),
      );

      const code = result.duplicate ? 200 : 202;
      return reply.code(code).send({
        inbox_id: result.inbox_id,
        status: result.status,
        duplicate: result.duplicate ?? false,
      });
    } catch (err) {
      request.log.error({ err, tenantSlug }, "webhook receive failed");
      throw err;
    }
  });
}
