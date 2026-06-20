import type { FastifyReply, FastifyRequest } from "fastify";
import { withTenant } from "../../db/client.js";
import { getTenantSecret } from "../platform/secret-vault.service.js";
import { resolveTenantIdBySlug, TenantNotFoundError } from "../platform/tenant-resolver.js";

export type ChannelAuthContext = {
  tenantId: string;
  tenantSlug: string;
};

declare module "fastify" {
  interface FastifyRequest {
    channelAuth?: ChannelAuthContext;
  }
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function channelAuthGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const tenantSlug = readHeader(request, "x-tenant-slug");
  const token = readHeader(request, "x-channel-token");

  if (!tenantSlug || !token) {
    reply.code(401).send({
      error: "CHANNEL_AUTH_REQUIRED",
      message: "Headers x-tenant-slug e x-channel-token obrigatorios",
    });
    return;
  }

  let tenantId: string;
  try {
    tenantId = await resolveTenantIdBySlug(tenantSlug);
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      reply.code(404).send({ error: "TENANT_NOT_FOUND", message: "Tenant nao encontrado" });
      return;
    }
    throw err;
  }

  const expected = await withTenant(tenantId, (db) =>
    getTenantSecret(db, tenantId, "channel_token"),
  );

  if (!expected) {
    reply.code(422).send({
      error: "CHANNEL_TOKEN_MISSING",
      message: "Token de canal nao configurado para o tenant",
    });
    return;
  }

  if (token !== expected) {
    reply.code(401).send({
      error: "INVALID_CHANNEL_TOKEN",
      message: "Token de canal invalido",
    });
    return;
  }

  request.channelAuth = { tenantId, tenantSlug };
}
