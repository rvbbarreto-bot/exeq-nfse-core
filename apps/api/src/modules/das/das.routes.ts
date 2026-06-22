import type { FastifyInstance } from "fastify";
import { emitDasGuiaSchema, listDasGuiasQuerySchema } from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { WRITE_ROLES } from "../../plugins/rbac.js";
import {
  DuplicateDasCompetenciaError,
  DuplicateDasIdempotencyError,
  emitDasGuia,
  getDasGuia,
  GuiaNotFoundError,
  listDasGuias,
  ProviderNotFoundError,
} from "./das.service.js";

export async function dasRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authWrite = { preHandler: [app.authenticate, app.requireRoles(...WRITE_ROLES)] };

  app.get("/v1/das/guias", auth, async (request, reply) => {
    const query = listDasGuiasQuerySchema.parse(request.query);
    try {
      const result = await withTenant(request.user.tenant_id, (db) =>
        listDasGuias(db, request.user.tenant_id, query),
      );
      return {
        guias: result.guias,
        count: result.guias.length,
        page_limit: query.limit,
        next_cursor: result.next_cursor,
      };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/das/guias/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const guia = await withTenant(request.user.tenant_id, (db) =>
        getDasGuia(db, request.user.tenant_id, id),
      );
      return { guia };
    } catch (err) {
      if (err instanceof GuiaNotFoundError) {
        return reply.code(404).send({ error: "GUIA_NOT_FOUND", message: "Guia nao encontrada" });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/das/emitir", authWrite, async (request, reply) => {
    const body = emitDasGuiaSchema.parse(request.body);
    try {
      const guia = await withTenant(request.user.tenant_id, (db) =>
        emitDasGuia(db, request.user.tenant_id, body),
      );
      return reply.code(201).send({ guia });
    } catch (err) {
      if (err instanceof DuplicateDasIdempotencyError) {
        const guia = await withTenant(request.user.tenant_id, (db) =>
          getDasGuia(db, request.user.tenant_id, err.guiaId),
        );
        return reply.code(200).send({ guia, deduplicated: true });
      }
      if (err instanceof DuplicateDasCompetenciaError) {
        return reply.code(409).send({
          error: "GUIA_COMPETENCIA_EXISTS",
          message: "Ja existe guia para esta competencia",
          guia_id: err.guiaId,
        });
      }
      if (err instanceof ProviderNotFoundError) {
        return reply.code(404).send({ error: "PROVIDER_NOT_FOUND", message: "Prestador nao encontrado" });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
