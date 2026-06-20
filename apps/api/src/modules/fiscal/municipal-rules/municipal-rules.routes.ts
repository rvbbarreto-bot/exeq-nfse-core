import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { upsertMunicipalEmissionRulesSchema } from "@exeq/shared";
import { getDb } from "../../../db/client.js";
import { ADMIN_ROLES } from "../../../plugins/rbac.js";
import { createMunicipalRulesService } from "./municipal-rules.service.js";

const ibgeParamSchema = z.object({
  ibge: z.string().length(7).regex(/^\d{7}$/),
});

/** Regras municipais globais (exeq_core) — onboarding e governança CNC. */
export async function municipalRulesRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };
  const authAdmin = { preHandler: [app.authenticate, app.requireRoles(...ADMIN_ROLES)] };

  app.get("/v1/fiscal/municipal-rules", auth, async () => {
    const service = createMunicipalRulesService(getDb());
    const items = await service.listAll();
    return { items };
  });

  app.get("/v1/fiscal/municipal-rules/:ibge", auth, async (request) => {
    const { ibge } = ibgeParamSchema.parse(request.params);
    const service = createMunicipalRulesService(getDb());
    const rules = await service.resolveByIbge(ibge);
    return rules;
  });

  app.put("/v1/fiscal/municipal-rules/:ibge", authAdmin, async (request, reply) => {
    const { ibge } = ibgeParamSchema.parse(request.params);
    const body = upsertMunicipalEmissionRulesSchema.parse(request.body);
    const service = createMunicipalRulesService(getDb());
    const rules = await service.upsert(ibge, body);
    return reply.code(200).send(rules);
  });
}
