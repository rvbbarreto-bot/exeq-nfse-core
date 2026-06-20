import type { FastifyInstance } from "fastify";
import { taxResolveRequestSchema } from "@exeq/shared";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { resolveTaxParams } from "./tax-resolve.service.js";

export async function taxRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/tax/resolve",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = taxResolveRequestSchema.parse(request.body);
      const tenantId = request.user.tenant_id;

      try {
        const result = await withTenant(tenantId, (db) =>
          resolveTaxParams(db, tenantId, body),
        );
        return result;
      } catch (err) {
        if (handleDomainError(err, reply)) return;
        throw err;
      }
    },
  );
}
