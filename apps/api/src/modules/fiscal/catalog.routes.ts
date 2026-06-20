import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createFiscalProfileSchema,
  createMunicipalTaxRuleSchema,
  updateFiscalProfileSchema,
  updateMunicipalTaxRuleSchema,
} from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { ADMIN_ROLES, WRITE_ROLES } from "../../plugins/rbac.js";
import * as catalog from "./catalog.service.js";

const publishChecklistPatchSchema = z.object({
  csv_validated: z.boolean().optional(),
  rules_reviewed: z.boolean().optional(),
  validado_contador: z.boolean().optional(),
  terms_accepted: z.boolean().optional(),
});
export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authWrite = { preHandler: [app.authenticate, app.requireRoles(...WRITE_ROLES)] };
  const authAdmin = { preHandler: [app.authenticate, app.requireRoles(...ADMIN_ROLES)] };

  app.get("/v1/fiscal/profiles", auth, async (request) => {
    const items = await withTenant(request.user.tenant_id, (db) =>
      catalog.listFiscalProfiles(db, request.user.tenant_id),
    );
    return { items };
  });

  app.post("/v1/fiscal/profiles", authWrite, async (request, reply) => {
    const body = createFiscalProfileSchema.parse(request.body);
    const row = await withTenant(request.user.tenant_id, (db) =>
      catalog.createFiscalProfile(db, request.user.tenant_id, body),
    );
    return reply.code(201).send(row);
  });

  app.get("/v1/fiscal/profiles/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.getFiscalProfile(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/fiscal/profiles/:id", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateFiscalProfileSchema.parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.updateFiscalProfile(db, request.user.tenant_id, id, body),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/fiscal/catalogs", auth, async (request) => {
    const items = await withTenant(request.user.tenant_id, (db) =>
      catalog.listCatalogs(db, request.user.tenant_id),
    );
    return { items };
  });

  app.post("/v1/fiscal/catalogs", authWrite, async (request, reply) => {
    const row = await withTenant(request.user.tenant_id, (db) =>
      catalog.createDraftCatalog(db, request.user.tenant_id),
    );
    return reply.code(201).send(row);
  });

  app.get("/v1/fiscal/catalogs/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.getCatalog(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/fiscal/catalogs/:id/publish", authAdmin, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.publishCatalog(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/fiscal/catalogs/:id/rules", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const items = await withTenant(request.user.tenant_id, (db) =>
        catalog.listCatalogRules(db, request.user.tenant_id, id),
      );
      return { items };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/fiscal/catalogs/:id/rules", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createMunicipalTaxRuleSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, (db) =>
        catalog.addCatalogRule(db, request.user.tenant_id, id, body),
      );
      return reply.code(201).send(row);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.delete("/v1/fiscal/catalogs/:catalogId/rules/:ruleId", authWrite, async (request, reply) => {
    const { catalogId, ruleId } = request.params as { catalogId: string; ruleId: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.deleteCatalogRule(db, request.user.tenant_id, catalogId, ruleId),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/fiscal/catalogs/:catalogId/rules/:ruleId", authWrite, async (request, reply) => {
    const { catalogId, ruleId } = request.params as { catalogId: string; ruleId: string };
    const body = updateMunicipalTaxRuleSchema.parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.updateCatalogRule(db, request.user.tenant_id, catalogId, ruleId, body),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/fiscal/catalogs/:id/publish-checklist", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const checklist = await withTenant(request.user.tenant_id, (db) =>
        catalog.getPublishChecklist(db, request.user.tenant_id, id),
      );
      return { checklist };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/fiscal/catalogs/:id/publish-checklist", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = publishChecklistPatchSchema.parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        catalog.updatePublishChecklist(db, request.user.tenant_id, id, body),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/fiscal/catalogs/:id/rules/import", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body;
    const csvContent =
      typeof body === "string"
        ? body
        : typeof body === "object" && body !== null && "csv" in body
          ? String((body as { csv: string }).csv)
          : "";

    if (!csvContent.trim()) {
      return reply.code(400).send({
        error: "INVALID_CSV",
        message: "Envie o conteudo CSV como text/plain ou { csv: string }",
      });
    }

    try {
      const result = await withTenant(request.user.tenant_id, (db) =>
        catalog.importCatalogRulesFromCsv(db, request.user.tenant_id, id, csvContent),
      );
      return reply.code(result.imported > 0 ? 201 : 422).send(result);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
