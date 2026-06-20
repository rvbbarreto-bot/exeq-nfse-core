import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createChargeSchema, listChargesQuerySchema } from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { shouldRegisterChargeAtGateway } from "../integration/gateway/payment-gateway.client.js";
import { cancelCharge } from "./cancel-charge.use-case.js";
import {
  ChargeNotCancellableError,
  ChargeNfIssueAlreadyLinkedError,
  createCharge,
  DuplicateChargeIdempotencyError,
  getChargeDetail,
  getChargeStats,
  exportChargesCsv,
  listCharges,
} from "./charge.service.js";
import {
  GatewayCredentialError,
  GatewayRegistrationError,
  registerChargeAtGateway,
} from "./register-charge-gateway.use-case.js";
import { WRITE_ROLES } from "../../plugins/rbac.js";

export async function chargeRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authWrite = { preHandler: [app.authenticate, app.requireRoles(...WRITE_ROLES)] };

  app.get("/v1/charges/stats", auth, async (request, reply) => {
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        getChargeStats(db, request.user.tenant_id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/charges", auth, async (request, reply) => {
    const query = listChargesQuerySchema.parse(request.query);
    try {
      const { items, next_cursor } = await withTenant(request.user.tenant_id, (db) =>
        listCharges(db, request.user.tenant_id, query),
      );
      return {
        items: items.map((r) => ({
          ...r,
          amount_cents: Number(r.amount_cents),
        })),
        next_cursor,
      };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/charges/export", auth, async (request, reply) => {
    const query = listChargesQuerySchema.parse(request.query);
    try {
      const csv = await withTenant(request.user.tenant_id, (db) =>
        exportChargesCsv(db, request.user.tenant_id, query),
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="cobrancas.csv"')
        .send(csv);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/charges", authWrite, async (request, reply) => {
    const body = createChargeSchema.parse(request.body);
    try {
      const result = await withTenant(request.user.tenant_id, async (db) => {
        const row = await createCharge(
          db,
          request.user.tenant_id,
          body,
          request.correlationId ?? randomUUID(),
        );
        if (!shouldRegisterChargeAtGateway()) {
          return row;
        }
        return registerChargeAtGateway(db, request.user.tenant_id, row);
      });
      return reply.code(201).send({
        id: result.id,
        status: result.status,
        correlation_id: result.correlation_id,
        gateway_ref: result.gateway_ref ?? undefined,
        nf_issue_id: result.nf_issue_id ?? undefined,
      });
    } catch (err) {
      if (err instanceof GatewayCredentialError) {
        return reply.code(422).send({
          error: err.message,
          message: err.operator.detail,
          operator: err.operator,
        });
      }
      if (err instanceof GatewayRegistrationError) {
        return reply.code(502).send({
          error: err.message,
          message: err.operator.detail,
          operator: err.operator,
        });
      }
      if (err instanceof DuplicateChargeIdempotencyError) {
        return reply.code(409).send({
          error: err.message,
          charge_id: err.chargeId,
          message: "Idempotency key ja utilizada",
        });
      }
      if (err instanceof ChargeNfIssueAlreadyLinkedError) {
        return reply.code(409).send({
          error: err.message,
          charge_id: err.chargeId,
          message: "Emissao NF ja vinculada a outra cobranca ativa",
        });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/charges/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        getChargeDetail(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/charges/:id/cancel", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        cancelCharge(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (err instanceof ChargeNotCancellableError) {
        return reply.code(409).send({
          error: err.message,
          message: "Somente cobrancas pendentes ou registradas podem ser canceladas",
        });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
