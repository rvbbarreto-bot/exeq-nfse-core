import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  collectChannelSessionSchema,
  createChannelSessionSchema,
} from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { channelAuthGuard } from "./channel-auth.js";
import {
  assertChannelPhoneAllowed,
  ChannelPhoneNotAllowedError,
} from "./channel-phone-guard.js";
import {
  ackChannelNotification,
  ChannelSessionNotReadyError,
  collectChannelSessionDraft,
  createChannelSession,
  DuplicateChannelSessionError,
  getChannelSession,
  listPendingChannelNotifications,
} from "./channel.service.js";
import { confirmChannelSession } from "./confirm-channel-session.use-case.js";
import { enqueueChannelInboundDebounce } from "./channel-inbound-debounce.service.js";
import {
  recordInboundBeforeDebounce,
  upsertChannelContact,
} from "./channel-contact.service.js";
import { processChannelInbound } from "./process-channel-inbound.use-case.js";
import { getRedisConnection } from "../../workers/queues.js";

function resolveInboundBody(body: z.infer<typeof channelInboundSchema>): string {
  const transcribed = (body.transcribed_text ?? "").trim();
  if (transcribed) return transcribed;
  return (body.text ?? "").trim();
}

const channelInboundSchema = z.object({
  phone_e164: z.string().min(10).max(20).regex(/^\+?\d+$/),
  message_id: z.string().min(4).max(128),
  text: z.string().max(8000).optional(),
  transcribed_text: z.string().max(8000).optional(),
  contact_name: z.string().max(255).optional(),
});

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  const channelAuth = { preHandler: [channelAuthGuard] };

  app.post("/v1/channel/inbound", channelAuth, async (request, reply) => {
    const body = channelInboundSchema.parse(request.body);
    const { tenantId } = request.channelAuth!;

    try {
      assertChannelPhoneAllowed(body.phone_e164);
    } catch (err) {
      if (err instanceof ChannelPhoneNotAllowedError) {
        return reply.code(403).send({
          error: err.code,
          message: "Telefone nao autorizado — piloto fechado (CHANNEL_ALLOWED_SENDERS)",
          phone_e164: err.phone_e164,
          send_reply: false,
        });
      }
      throw err;
    }

    try {
      const messageBody = resolveInboundBody(body);

      const persist = await withTenant(tenantId, async (db) => {
        const contact = await upsertChannelContact(db, tenantId, {
          phone_e164: body.phone_e164,
          display_name: body.contact_name,
        });
        const status = await recordInboundBeforeDebounce(db, tenantId, {
          contact_id: contact.id,
          message_id: body.message_id,
          message_body: messageBody.slice(0, 4000) || "(vazio)",
        });
        return status;
      });

      if (persist === "duplicate") {
        return reply.code(200).send({
          session_id: null,
          status: "deduplicated",
          reply_text: "",
          emitted: false,
          send_reply: false,
          buffered: false,
          deduplicated: true,
        });
      }

      const debounce = await enqueueChannelInboundDebounce(
        getRedisConnection(),
        tenantId,
        body,
      );

      if (debounce.action === "buffered") {
        return reply.code(200).send({
          session_id: null,
          status: "buffered",
          reply_text: "",
          emitted: false,
          send_reply: false,
          buffered: true,
          debounce_seconds: debounce.debounce_seconds,
          debounce_outbound: "evolution_async",
        });
      }

      const result = await withTenant(tenantId, (db) =>
        processChannelInbound(db, tenantId, {
          ...debounce.batch,
          skip_inbound_log: true,
        }, request.correlationId ?? randomUUID()),
      );
      return reply.code(200).send({
        ...result,
        send_reply: Boolean(result.reply_text?.trim()),
        buffered: false,
        debounce_message_count: debounce.message_count,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "CHANNEL_MASTER_DATA_MISSING") {
        return reply.code(422).send({
          error: "CHANNEL_MASTER_DATA_MISSING",
          message: "Cadastre prestador, tomador e serviço — npm run homolog:focus:ensure-data",
        });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/channel/sessions", channelAuth, async (request, reply) => {
    const body = createChannelSessionSchema.parse(request.body);
    const { tenantId } = request.channelAuth!;

    try {
      assertChannelPhoneAllowed(body.phone_e164);
    } catch (err) {
      if (err instanceof ChannelPhoneNotAllowedError) {
        return reply.code(403).send({
          error: err.code,
          message: "Telefone nao autorizado — piloto fechado (CHANNEL_ALLOWED_SENDERS)",
          phone_e164: err.phone_e164,
        });
      }
      throw err;
    }

    try {
      const session = await withTenant(tenantId, (db) =>
        createChannelSession(db, tenantId, body, request.correlationId ?? randomUUID()),
      );
      return reply.code(201).send({
        session_id: session.id,
        status: session.status,
        phone_e164: session.phone_e164,
        missing_fields: [],
      });
    } catch (err) {
      if (err instanceof DuplicateChannelSessionError) {
        const existing = await withTenant(tenantId, (db) =>
          getChannelSession(db, tenantId, err.sessionId),
        );
        return reply.code(409).send({
          error: "DUPLICATE_CHANNEL_SESSION",
          session_id: err.sessionId,
          status: existing.status,
          message: "Sessao de canal ja existe para esta chave de idempotencia",
        });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/channel/sessions/:id", channelAuth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.channelAuth!;

    try {
      const session = await withTenant(tenantId, (db) =>
        getChannelSession(db, tenantId, id),
      );
      return {
        session_id: session.id,
        status: session.status,
        phone_e164: session.phone_e164,
        draft: session.draft_payload,
        missing_fields: session.missing_fields,
        nf_issue_id: session.nf_issue_id,
      };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/channel/sessions/:id", channelAuth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patch = collectChannelSessionSchema.parse(request.body);
    const { tenantId } = request.channelAuth!;

    try {
      const session = await withTenant(tenantId, (db) =>
        collectChannelSessionDraft(db, tenantId, id, patch),
      );
      return {
        session_id: session.id,
        status: session.status,
        draft: session.draft_payload,
        missing_fields: session.missing_fields,
      };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/channel/sessions/:id/confirm", channelAuth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.channelAuth!;

    try {
      const result = await withTenant(tenantId, (db) =>
        confirmChannelSession(db, tenantId, id, request.correlationId ?? randomUUID()),
      );
      const code = result.duplicate ? 200 : 202;
      return reply.code(code).send(result);
    } catch (err) {
      if (err instanceof ChannelSessionNotReadyError) {
        return reply.code(422).send({
          error: "CHANNEL_SESSION_NOT_READY",
          message: "Draft incompleto para confirmacao",
          missing_fields: err.missing,
        });
      }
      if (handleDomainError(err, reply)) return;
      if (err instanceof Error && err.message === "FOCUS_TOKEN_MISSING") {
        return reply.code(422).send({
          error: "FOCUS_TOKEN_MISSING",
          message: "Token Focus nao configurado",
        });
      }
      throw err;
    }
  });

  app.get("/v1/channel/notifications/pending", channelAuth, async (request) => {
    const { tenantId } = request.channelAuth!;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }).parse(
      request.query,
    );

    const items = await withTenant(tenantId, (db) =>
      listPendingChannelNotifications(db, tenantId, query.limit ?? 20),
    );
    return { items };
  });

  app.post("/v1/channel/notifications/:id/ack", channelAuth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.channelAuth!;

    await withTenant(tenantId, (db) => ackChannelNotification(db, tenantId, id));
    return reply.code(204).send();
  });
}
