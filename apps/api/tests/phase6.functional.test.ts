process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";
process.env.WEBHOOK_SYNC_PROCESSING = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";
import {
  computeWebhookSignature,
  PILOT_TENANT_SLUG,
  PILOT_WEBHOOK_SECRET,
} from "./helpers/billing-setup.js";
import { countPaymentEventsForInbox } from "../src/modules/billing/webhook-inbox.service.js";
import { withTenant } from "../src/db/client.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

function signedWebhook(app: Awaited<ReturnType<typeof buildApp>>, payload: object) {
  const rawBody = JSON.stringify(payload);
  const signature = computeWebhookSignature(rawBody, PILOT_WEBHOOK_SECRET);
  return app.inject({
    method: "POST",
    url: `/v1/webhooks/gateway/${PILOT_TENANT_SLUG}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signature,
    },
    payload: rawBody,
  });
}

describe("Fase 6 — cobranca + webhooks (funcional)", () => {
  let token: string;
  let customerId: string;
  let tenantId: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    await restoreSeedPublishedCatalog();

    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    token = login.json().access_token;
    const md = await setupEmissionMasterData(app, token);
    customerId = md.customerId;
    tenantId = login.json().tenant_id;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  it("FC-01: CRUD cobranca — cria e consulta", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fc-charge-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 250000,
        due_date: "2026-07-15",
        description: "Servico consultoria Fase 6",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe("pending");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${create.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().amount_cents).toBe(250000);
    expect(detail.json().payment_events).toHaveLength(0);
    await app.close();
  });

  it("FC-02: webhook sandbox baixa cobranca (paid)", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fc-wh-paid-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 180000,
        due_date: "2026-07-20",
      },
    });
    const chargeId = create.json().id;
    const idempotencyKey = `wh-paid-${Date.now()}`;

    const webhook = await signedWebhook(app, {
      idempotency_key: idempotencyKey,
      event: "payment.paid",
      charge_id: chargeId,
      amount_cents: 180000,
      paid_at: "2026-06-15T14:30:00.000Z",
      gateway_ref: "gw-sandbox-001",
    });
    expect(webhook.statusCode).toBe(202);
    expect(webhook.json().duplicate).toBe(false);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${chargeId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().status).toBe("paid");
    expect(detail.json().payment_events).toHaveLength(1);
    await app.close();
  });

  it("FC-03: idempotency webhook — segunda entrega nao duplica baixa", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fc-wh-idem-ch-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 99000,
        due_date: "2026-07-25",
      },
    });
    const chargeId = create.json().id;
    const idempotencyKey = `wh-idem-${Date.now()}`;

    const payload = {
      idempotency_key: idempotencyKey,
      event: "payment.paid",
      charge_id: chargeId,
      amount_cents: 99000,
      paid_at: "2026-06-16T10:00:00.000Z",
    };

    const first = await signedWebhook(app, payload);
    expect(first.statusCode).toBe(202);

    const second = await signedWebhook(app, payload);
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().inbox_id).toBe(first.json().inbox_id);

    const paymentCount = await withTenant(tenantId, (db) =>
      countPaymentEventsForInbox(db, tenantId, first.json().inbox_id),
    );
    expect(paymentCount).toBe(1);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${chargeId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().payment_events).toHaveLength(1);
    await app.close();
  });

  it("FC-04: assinatura invalida retorna 401", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/gateway/${PILOT_TENANT_SLUG}`,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": "sha256=deadbeef",
      },
      payload: JSON.stringify({
        idempotency_key: `wh-bad-sig-${Date.now()}`,
        event: "payment.paid",
        charge_id: "550e8400-e29b-41d4-a716-446655440000",
        amount_cents: 100,
      }),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("FC-05: cancela cobranca pendente", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fc-cancel-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 45000,
        due_date: "2026-08-01",
      },
    });
    const chargeId = create.json().id;

    const cancel = await app.inject({
      method: "POST",
      url: `/v1/charges/${chargeId}/cancel`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe("cancelled");
    await app.close();
  });

  it("FC-06: valor divergente falha conciliacao sem baixar cobranca", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fc-mismatch-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 120000,
        due_date: "2026-08-10",
      },
    });
    const chargeId = create.json().id;

    const webhook = await signedWebhook(app, {
      idempotency_key: `wh-mismatch-${Date.now()}`,
      event: "payment.paid",
      charge_id: chargeId,
      amount_cents: 119999,
      paid_at: "2026-06-17T12:00:00.000Z",
    });
    expect(webhook.statusCode).toBe(202);
    expect(webhook.json().status).toBe("failed");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${chargeId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().status).toBe("pending");
    expect(detail.json().payment_events).toHaveLength(0);
    await app.close();
  });
});