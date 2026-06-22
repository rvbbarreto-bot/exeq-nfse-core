import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ADMIN_ROLES } from "../../plugins/rbac.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { runBackfillTaxSnapshots } from "./backfill-tax-snapshot.service.js";

const backfillBodySchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  dry_run: z.boolean().optional(),
});

export async function fiscalOpsRoutes(app: FastifyInstance): Promise<void> {
  const authAdmin = { preHandler: [app.authenticate, app.requireRoles(...ADMIN_ROLES)] };

  app.post("/v1/fiscal/admin/backfill-snapshots", authAdmin, async (request, reply) => {
    const body = backfillBodySchema.parse(request.body ?? {});

    try {
      const summary = await runBackfillTaxSnapshots({
        tenantId: request.user.tenant_id,
        days: body.days,
        limit: body.limit,
        dryRun: body.dry_run ?? false,
      });

      return reply.code(body.dry_run ? 200 : 201).send(summary);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("TENANT_NOT_FOUND")) {
        return reply.code(404).send({
          error: "TENANT_NOT_FOUND",
          message: "Tenant não encontrado",
        });
      }
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
