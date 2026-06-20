import type { FastifyInstance } from "fastify";
import {
  createCustomerSchema,
  createProviderSchema,
  createServiceCatalogItemSchema,
  updateCustomerSchema,
  updateProviderSchema,
  updateServiceCatalogItemSchema,
} from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import * as svc from "./master-data.service.js";
import { WRITE_ROLES } from "../../plugins/rbac.js";

export async function masterDataRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authWrite = { preHandler: [app.authenticate, app.requireRoles(...WRITE_ROLES)] };

  app.get("/v1/providers", auth, async (request, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, (db) =>
        svc.listProviders(db, request.user.tenant_id),
      );
      return { items: rows };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.post("/v1/providers", authWrite, async (request, reply) => {
    const body = createProviderSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, (db) =>
        svc.createProvider(db, request.user.tenant_id, body),
      );
      return reply.code(201).send(row);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/providers/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        svc.getProvider(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/providers/:id", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProviderSchema.parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        svc.updateProvider(db, request.user.tenant_id, id, body),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/customers", auth, async (request) => {
    const rows = await withTenant(request.user.tenant_id, (db) =>
      svc.listCustomers(db, request.user.tenant_id),
    );
    return { items: rows };
  });

  app.post("/v1/customers", authWrite, async (request, reply) => {
    const body = createCustomerSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, (db) =>
        svc.createCustomer(db, request.user.tenant_id, body),
      );
      return reply.code(201).send(row);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/customers/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        svc.getCustomer(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/customers/:id", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateCustomerSchema.parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        svc.updateCustomer(db, request.user.tenant_id, id, body),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/services", auth, async (request) => {
    const rows = await withTenant(request.user.tenant_id, (db) =>
      svc.listServiceCatalog(db, request.user.tenant_id),
    );
    return { items: rows };
  });

  app.post("/v1/services", authWrite, async (request, reply) => {
    const body = createServiceCatalogItemSchema.parse(request.body);
    try {
      const row = await withTenant(request.user.tenant_id, (db) =>
        svc.createServiceCatalogItem(db, request.user.tenant_id, body),
      );
      return reply.code(201).send(row);
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/services/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        svc.getServiceCatalogItem(db, request.user.tenant_id, id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.patch("/v1/services/:id", authWrite, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateServiceCatalogItemSchema.parse(request.body);
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        svc.updateServiceCatalogItem(db, request.user.tenant_id, id, body),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
