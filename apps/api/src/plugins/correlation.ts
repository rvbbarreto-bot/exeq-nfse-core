import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export async function correlationPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const incoming = request.headers["x-correlation-id"];
    const correlationId =
      typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    request.correlationId = correlationId;
    reply.header("x-correlation-id", correlationId);
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
      },
      "request completed",
    );
  });
}
