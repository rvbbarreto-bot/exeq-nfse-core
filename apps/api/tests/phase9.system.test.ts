process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";
process.env.WEBHOOK_SYNC_PROCESSING = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, getDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import { setupEmissionMasterData } from "./helpers/emission-setup.js";
import {
  buildEmitPayload,
  emitViaApi,
  emitViaChannel,
  PILOT_MUNICIPIOS,
  type QaMasterData,
} from "./helpers/qa-setup.js";
import { channelHeaders, findChannelNotificationForIssue } from "./helpers/channel-setup.js";
import {
  computeWebhookSignature,
  PILOT_TENANT_SLUG,
  PILOT_WEBHOOK_SECRET,
} from "./helpers/billing-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Fase 9 — testes de sistema (unitários de sistema)", () => {
  let md: QaMasterData;

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
    const master = await setupEmissionMasterData(app, login.json().access_token);
    md = {
      token: login.json().access_token,
      tenantId: login.json().tenant_id,
      ...master,
    };
    await app.close();
  }, 90_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  it("QS-01: health reporta fase 9", async () => {
    const app = await buildApp();
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().phase).toBe("10");
    expect(health.json().status).toBe("ok");
    await app.close();
  });

  it("QS-02: critério aceite — emissão bloqueada sem regra fiscal", async () => {
    const app = await buildApp();
    const res = await emitViaApi(
      app,
      md.token,
      buildEmitPayload(md, "3550308", `qs-no-rule-${Date.now()}`),
    );
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("rejected");
    await app.close();
  });

  it("QS-03: critério aceite — idempotency emissão", async () => {
    const app = await buildApp();
    const key = `qs-idem-emit-${Date.now()}`;
    const payload = buildEmitPayload(md, PILOT_MUNICIPIOS[0]!.code, key);
    const first = await emitViaApi(app, md.token, payload);
    const dup = await emitViaApi(app, md.token, payload);
    expect(first.statusCode).toBe(202);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().issue_id).toBe(first.json().issue_id);
    await app.close();
  });

  it("QS-04: critério aceite — idempotency webhook cobrança", async () => {
    const app = await buildApp();
    const charge = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${md.token}` },
      payload: {
        idempotency_key: `qs-ch-${Date.now()}`,
        customer_id: md.customerId,
        amount_cents: 50000,
        due_date: "2026-08-01",
      },
    });
    const chargeId = charge.json().id;
    const whPayload = {
      idempotency_key: `qs-wh-${Date.now()}`,
      event: "payment.paid",
      charge_id: chargeId,
      amount_cents: 50000,
      paid_at: "2026-06-20T12:00:00.000Z",
    };
    const raw = JSON.stringify(whPayload);
    const sig = computeWebhookSignature(raw, PILOT_WEBHOOK_SECRET);
    const headers = {
      "content-type": "application/json",
      "x-webhook-signature": sig,
    };
    const first = await app.inject({
      method: "POST",
      url: `/v1/webhooks/gateway/${PILOT_TENANT_SLUG}`,
      headers,
      payload: raw,
    });
    const second = await app.inject({
      method: "POST",
      url: `/v1/webhooks/gateway/${PILOT_TENANT_SLUG}`,
      headers,
      payload: raw,
    });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    await app.close();
  });

  it("QS-05: critério aceite — idempotency sessão canal", async () => {
    const app = await buildApp();
    const key = `qs-ch-sess-${Date.now()}`;
    const first = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: { phone_e164: "+5511888009900", idempotency_key: key },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/channel/sessions",
      headers: channelHeaders(),
      payload: { phone_e164: "+5511888009900", idempotency_key: key },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().session_id).toBe(first.json().session_id);
    await app.close();
  });

  it("QS-06: auditoria NF — eventos + resolved_rule_id", async () => {
    const app = await buildApp();
    const emit = await emitViaApi(
      app,
      md.token,
      buildEmitPayload(md, PILOT_MUNICIPIOS[1]!.code, `qs-audit-${Date.now()}`),
    );
    const issueId = emit.json().issue_id;
    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}`,
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(detail.json().resolved_rule_id).toBeTruthy();
    expect(detail.json().events.length).toBeGreaterThanOrEqual(4);
    expect(detail.json().events.some((e: { to_status: string }) => e.to_status === "authorized")).toBe(
      true,
    );

    const audit = await withTenant(md.tenantId, (db) =>
      db`
        SELECT action FROM exeq_core.audit_log
        WHERE tenant_id = ${md.tenantId}::uuid AND entity_id = ${issueId}::uuid
      `,
    );
    expect(audit.length).toBeGreaterThan(0);
    await app.close();
  });

  it("QS-07: RLS — channel_session isolado por tenant", async () => {
    const db = getDb();
    const [other] = await db<{ id: string }[]>`
      INSERT INTO exeq_core.tenants (slug, legal_name, status)
      VALUES ('qa-tenant-b', 'QA Tenant B', 'active')
      ON CONFLICT (slug) DO UPDATE SET legal_name = EXCLUDED.legal_name
      RETURNING id
    `;
    const tenantB = other!.id;

    await withTenant(md.tenantId, async (dbTx) => {
      await dbTx`
        INSERT INTO exeq_core.channel_session (
          tenant_id, idempotency_key, phone_e164, status, correlation_id
        ) VALUES (
          ${md.tenantId}::uuid, ${`qs-rls-${Date.now()}`}, '+5511777000001',
          'collecting', gen_random_uuid()
        )
      `;
    });

    const visibleB = await db.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantB}, true)`;
      return tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM exeq_core.channel_session
      `;
    });
    expect(Number(visibleB[0]!.count)).toBe(0);
  });

  it("QS-08: alíquota emitida = regra publicada (tax resolve vs emissão)", async () => {
    const app = await buildApp();
    const ibge = PILOT_MUNICIPIOS[2]!.code;
    const tax = await app.inject({
      method: "POST",
      url: "/v1/tax/resolve",
      headers: { authorization: `Bearer ${md.token}` },
      payload: {
        ibge_code: ibge,
        service_code: "1.01",
        tax_regime: "simples_nacional",
        competence_date: "2026-06-01",
      },
    });
    expect(tax.statusCode).toBe(200);
    const ruleId = tax.json().rule_id;

    const emit = await emitViaApi(
      app,
      md.token,
      buildEmitPayload(md, ibge, `qs-tax-parity-${Date.now()}`),
    );
    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${emit.json().issue_id}`,
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(detail.json().resolved_rule_id).toBe(ruleId);
    await app.close();
  });

  it("QS-09: notificação canal — uma por evento terminal", async () => {
    const app = await buildApp();
    const confirm = await emitViaChannel(
      app,
      md,
      PILOT_MUNICIPIOS[0]!.code,
      `qs-notify-${Date.now()}`,
    );
    const issueId = confirm.json().issue_id;

    const notification = await findChannelNotificationForIssue(md.tenantId, issueId);
    expect(notification).toBeTruthy();
    expect(notification!.event_type).toBe("nf.authorized");
    expect(notification!.status).toBe("pending");
    await app.close();
  });

  it("QS-10: módulos core registrados (catalogo + cobrança + canal)", async () => {
    const app = await buildApp();

    const catalog = await app.inject({
      method: "GET",
      url: "/v1/fiscal/catalogs",
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(catalog.statusCode).toBe(200);

    const charges = await app.inject({
      method: "GET",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(charges.statusCode).toBe(200);

    const channel = await app.inject({
      method: "GET",
      url: "/v1/channel/notifications/pending",
      headers: channelHeaders(),
    });
    expect(channel.statusCode).toBe(200);
    await app.close();
  });
});
