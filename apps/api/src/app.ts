import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { correlationPlugin } from "./plugins/correlation.js";
import { registerAuthHooks } from "./plugins/auth.js";
import { registerRbacHooks } from "./plugins/rbac.js";
import { authRoutes } from "./modules/platform/auth.routes.js";
import { taxRoutes } from "./modules/fiscal/tax.routes.js";
import { catalogRoutes } from "./modules/fiscal/catalog.routes.js";
import { municipalRulesRoutes } from "./modules/fiscal/municipal-rules/municipal-rules.routes.js";
import { masterDataRoutes } from "./modules/master-data/master-data.routes.js";
import { nfIssueRoutes } from "./modules/issuance/nf-issue.routes.js";
import { chargeRoutes } from "./modules/billing/charge.routes.js";
import { webhookRoutes } from "./modules/billing/webhook.routes.js";
import { webhookInboxRoutes } from "./modules/billing/webhook-inbox.routes.js";
import { channelRoutes } from "./modules/channel/channel.routes.js";
import { opsRoutes } from "./modules/ops/ops.routes.js";
import { getDb } from "./db/client.js";
import { createMunicipalRulesService } from "./modules/fiscal/municipal-rules/municipal-rules.service.js";
import { ATIBAIA_IBGE } from "@exeq/shared";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  await app.register(correlationPlugin);
  registerAuthHooks(app);
  registerRbacHooks(app);

  app.get("/health", async () => {
    const db = getDb();
    await db`SELECT 1`;

    const atibaiaRules = await createMunicipalRulesService(db).resolveByIbge(ATIBAIA_IBGE);

    return {
      status: "ok",
      service: "exeq-nfse-core-api",
      phase: "10",
      nfse_routing_policy: env.NFSE_ROUTING_POLICY,
      gateway: {
        mock: env.GATEWAY_MOCK,
        base_url: env.GATEWAY_BASE_URL,
        sync_processing: env.GATEWAY_SYNC_PROCESSING,
      },
      focus: {
        mock: env.FOCUS_MOCK,
        base_url: env.FOCUS_BASE_URL,
        homolog_only: env.FOCUS_BASE_URL.includes("homologacao.focusnfe.com.br"),
      },
      atibaia_routing: {
        provider: atibaiaRules.provider_kind,
        ibge: ATIBAIA_IBGE,
        enviar_inscricao_municipal_prestador: atibaiaRules.enviar_inscricao_municipal_prestador,
      },
      nf_sync_processing: env.NF_SYNC_PROCESSING,
      betha: {
        status: env.NFSE_ROUTING_POLICY === "focus_only" ? "paused_by_po" : "available",
        deprecated_for_atibaia: true,
        atibaia_enabled: env.BETHA_ATIBAIA_ENABLED,
      },
    };
  });

  await app.register(authRoutes);
  await app.register(taxRoutes);
  await app.register(masterDataRoutes);
  await app.register(catalogRoutes);
  await app.register(municipalRulesRoutes);
  await app.register(nfIssueRoutes);
  await app.register(chargeRoutes);
  await app.register(webhookRoutes);
  await app.register(webhookInboxRoutes);
  await app.register(opsRoutes);
  await app.register(channelRoutes);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Payload invalido",
        details: error.flatten(),
      });
    }
    request.log.error({ err: error, correlationId: request.correlationId }, "unhandled error");
    return reply.code(500).send({
      error: "INTERNAL_ERROR",
      message: "Erro interno",
    });
  });

  return app;
}
