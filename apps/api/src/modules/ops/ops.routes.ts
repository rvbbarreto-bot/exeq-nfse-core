import type { FastifyInstance } from "fastify";
import { withTenant } from "../../db/client.js";
import { handleDomainError } from "../../lib/handle-domain-error.js";
import { getOpsAlerts } from "./ops-alerts.service.js";
import { getOpsSummary } from "./ops-summary.service.js";
import {
  listRecentChannelNotifications,
  listRecentChannelSessions,
} from "./channel-ops.service.js";

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [app.authenticate] };

  app.get("/v1/ops/summary", auth, async (request, reply) => {
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        getOpsSummary(db, request.user.tenant_id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/ops/alerts", auth, async (request, reply) => {
    try {
      return await withTenant(request.user.tenant_id, (db) =>
        getOpsAlerts(db, request.user.tenant_id),
      );
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/ops/channel/sessions", auth, async (request, reply) => {
    try {
      const items = await withTenant(request.user.tenant_id, (db) =>
        listRecentChannelSessions(db, request.user.tenant_id),
      );
      return { items };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });

  app.get("/v1/ops/channel/notifications", auth, async (request, reply) => {
    try {
      const items = await withTenant(request.user.tenant_id, (db) =>
        listRecentChannelNotifications(db, request.user.tenant_id),
      );
      return { items };
    } catch (err) {
      if (handleDomainError(err, reply)) return;
      throw err;
    }
  });
}
