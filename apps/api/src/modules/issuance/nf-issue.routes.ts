import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { emitNfseRequestSchema, listNfIssuesQuerySchema } from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { emitNfse } from "./emit-nf.use-case.js";
import { cancelNfIssue, CancelNotAllowedError } from "./cancel-nf.use-case.js";
import {
  DuplicateIdempotencyError,
  getNfIssueDetail,
  getNfIssueStats,
  exportNfIssueEventsCsv,
  exportNfIssuesCsv,
  listNfIssues,
} from "./nf-issue.service.js";
import { reprocessNfIssue, ReprocessNotAllowedError } from "./reprocess-nf.use-case.js";
import { EMIT_ROLES, WRITE_ROLES } from "../../plugins/rbac.js";

export async function nfIssueRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authEmit = { preHandler: [app.authenticate, app.requireRoles(...EMIT_ROLES)] };
  const authWrite = { preHandler: [app.authenticate, app.requireRoles(...WRITE_ROLES)] };

  app.post("/v1/nf/issues", authEmit, async (request, reply) => {
    const body = emitNfseRequestSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, (db) =>
        emitNfse(db, request.user.tenant_id, body, request.correlationId ?? randomUUID()),
      );
      return reply.code(202).send({
        issue_id: row.id,
        status: row.status,
        correlation_id: row.correlation_id,
      });
    } catch (err) {
      if (err instanceof DuplicateIdempotencyError) {
        return reply.code(409).send({
          error: err.message,
          issue_id: err.issueId,
          message: "Idempotency key ja utilizada",
        });
      }
      if (handleDomainError(err, reply)) return;
      if (err instanceof Error && err.message === "FOCUS_TOKEN_MISSING") {
        return reply.code(422).send({
          error: "FOCUS_TOKEN_MISSING",
          message: "Token Focus nao configurado para o tenant",
        });
      }
      throw err;
    }
  });

  app.get("/v1/nf/issues/stats", auth, async (request, reply) => {
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        getNfIssueStats(db, request.user.tenant_id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/nf/issues", auth, async (request, reply) => {
    const query = listNfIssuesQuerySchema.parse(request.query);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        listNfIssues(db, request.user.tenant_id, query),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/nf/issues/export", auth, async (request, reply) => {
    const query = listNfIssuesQuerySchema.parse(request.query);
    try {
      const csv = await withTenant(request.user.tenant_id, (db) =>
        exportNfIssuesCsv(db, request.user.tenant_id, query),
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="emissoes-nfse.csv"')
        .send(csv);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/nf/issues/:id/events/export", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const csv = await withTenant(request.user.tenant_id, (db) =>
        exportNfIssueEventsCsv(db, request.user.tenant_id, id),
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="emissao-eventos-${id.slice(0, 8)}.csv"`)
        .send(csv);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/nf/issues/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const detail = await withTenant(request.user.tenant_id, (db) =>
        getNfIssueDetail(db, request.user.tenant_id, id),
      );
      return detail;
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/nf/issues/:id/cancel", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ justificativa: z.string().min(15).max(500) }).parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        cancelNfIssue(db, request.user.tenant_id, id, body.justificativa),
      );
    } catch (err) {
      if (err instanceof CancelNotAllowedError) {
        return reply.code(409).send({
          error: err.message,
          message: "Somente NFS-e autorizada pode ser cancelada",
        });
      }
      if (handleDomainError(err, reply)) return;
      if (err instanceof Error && err.message === "FOCUS_TOKEN_MISSING") {
        return reply.code(422).send({ error: "FOCUS_TOKEN_MISSING", message: "Token Focus ausente" });
      }
      throw err;
    }
  });

  app.post("/v1/nf/issues/:id/reprocess", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        reprocessNfIssue(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (err instanceof ReprocessNotAllowedError) {
        return reply.code(409).send({
          error: err.message,
          message: "Somente emissoes com falha podem ser reprocessadas",
        });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
