import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { markWebhookInboxFailed } from "../src/modules/billing/webhook-inbox.service.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";
import {
  computeWebhookSignature,
  PILOT_TENANT_SLUG,
  PILOT_WEBHOOK_SECRET,
} from "./helpers/billing-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Release 1.3 — webhooks inbox listagem", () => {
  let token: string;
  let tenantId: string;
  let customerId: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    token = login.json().access_token;
    tenantId = login.json().tenant_id;
    const master = await setupEmissionMasterData(app, token);
    customerId = master.customerId;
    await app.close();
  }, 90_000);

  afterAll(async () => {
    await closeDb();
  });

  it("OP-02: lista webhooks com filtro status", async () => {
    const app = await buildApp();
    const charge = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `r13-ch-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 5000,
        due_date: "2026-10-01",
      },
    });
    const chargeId = charge.json().id;
    const key = `r13-wh-${Date.now()}`;
    const whBody = JSON.stringify({
      idempotency_key: key,
      event: "payment.paid",
      charge_id: chargeId,
      amount_cents: 5000,
      paid_at: "2026-06-21T10:00:00.000Z",
    });
    const webhook = await app.inject({
      method: "POST",
      url: `/v1/webhooks/gateway/${PILOT_TENANT_SLUG}`,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": computeWebhookSignature(whBody, PILOT_WEBHOOK_SECRET),
      },
      payload: whBody,
    });
    expect(webhook.statusCode).toBe(202);
    const inboxId = webhook.json().inbox_id as string;

    await withTenant(tenantId, (db) =>
      markWebhookInboxFailed(db, tenantId, inboxId, "Falha simulada UAT release 1.3"),
    );

    const list = await app.inject({
      method: "GET",
      url: "/v1/webhooks/inbox?status=failed&limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((i: { id: string }) => i.id === inboxId)).toBe(true);
    expect(list.json().next_cursor === null || typeof list.json().next_cursor === "string").toBe(
      true,
    );

    const detail = await app.inject({
      method: "GET",
      url: `/v1/webhooks/inbox/${inboxId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().status).toBe("failed");
    await app.close();
  });
});
