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
  buildEmitPayload,
  emitViaApi,
  emitViaChannel,
  PILOT_MUNICIPIOS,
  runRegressionSmoke,
  type QaMasterData,
} from "./helpers/qa-setup.js";
import { findChannelNotificationForIssue } from "./helpers/channel-setup.js";
import {
  computeWebhookSignature,
  PILOT_TENANT_SLUG,
  PILOT_WEBHOOK_SECRET,
} from "./helpers/billing-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

const LOAD_BATCH_SIZE = 25;

describe("Fase 9 — QA integral + homologação (funcional)", () => {
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

  for (const m of PILOT_MUNICIPIOS) {
    it(`FQ-H3-${m.code}: homologação emissão API — ${m.label}`, async () => {
      const app = await buildApp();
      const emit = await emitViaApi(
        app,
        md.token,
        buildEmitPayload(md, m.code, `fq-h3-api-${m.code}-${Date.now()}`),
      );
      expect(emit.statusCode).toBe(202);
      expect(emit.json().status).toBe("authorized");

      const detail = await app.inject({
        method: "GET",
        url: `/v1/nf/issues/${emit.json().issue_id}`,
        headers: { authorization: `Bearer ${md.token}` },
      });
      expect(detail.json().resolved_rule_id).toBeTruthy();
      expect(detail.json().focus_ref).toMatch(/^exeq-/);
      await app.close();
    });

    it(`FQ-H3-CH-${m.code}: homologação emissão canal — ${m.label}`, async () => {
      const app = await buildApp();
      const confirm = await emitViaChannel(
        app,
        md,
        m.code,
        `fq-h3-ch-${m.code}-${Date.now()}`,
        `+55119${m.code.slice(-4)}001`,
      );
      expect(confirm.statusCode).toBe(202);
      expect(confirm.json().status).toBe("authorized");

      const notification = await findChannelNotificationForIssue(
        md.tenantId,
        confirm.json().issue_id,
      );
      expect(notification).toBeTruthy();
      expect(notification!.event_type).toBe("nf.authorized");
      await app.close();
    });
  }

  it("FQ-01: E2E admin — stats, lista filtrada e detalhe emissão", async () => {
    const app = await buildApp();
    const emit = await emitViaApi(
      app,
      md.token,
      buildEmitPayload(md, "3504107", `fq-admin-${Date.now()}`),
    );
    const issueId = emit.json().issue_id;

    const stats = await app.inject({
      method: "GET",
      url: "/v1/nf/issues/stats",
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(stats.json().pilot_municipios).toHaveLength(4);
    expect(stats.json().by_status.authorized).toBeGreaterThan(0);

    const list = await app.inject({
      method: "GET",
      url: "/v1/nf/issues?status=authorized&ibge_code=3504107&limit=10",
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(list.json().items.some((i: { id: string }) => i.id === issueId)).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}`,
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(detail.json().events.length).toBeGreaterThan(0);
    await app.close();
  });

  it("FQ-02: E2E stack completo — emissão + cobrança + webhook", async () => {
    const app = await buildApp();
    const emit = await emitViaApi(
      app,
      md.token,
      buildEmitPayload(md, "3507605", `fq-stack-${Date.now()}`),
    );
    expect(emit.json().status).toBe("authorized");

    const charge = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${md.token}` },
      payload: {
        idempotency_key: `fq-stack-ch-${Date.now()}`,
        customer_id: md.customerId,
        amount_cents: 150000,
        due_date: "2026-09-01",
        description: "Stack QA Fase 9",
      },
    });
    const chargeId = charge.json().id;
    const whBody = JSON.stringify({
      idempotency_key: `fq-stack-wh-${Date.now()}`,
      event: "payment.paid",
      charge_id: chargeId,
      amount_cents: 150000,
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

    const paid = await app.inject({
      method: "GET",
      url: `/v1/charges/${chargeId}`,
      headers: { authorization: `Bearer ${md.token}` },
    });
    expect(paid.json().status).toBe("paid");
    await app.close();
  });

  it("FQ-03: cancelamento NFS-e autorizada (H3)", async () => {
    const app = await buildApp();
    const emit = await emitViaApi(
      app,
      md.token,
      buildEmitPayload(md, "3528502", `fq-cancel-${Date.now()}`),
    );
    const cancel = await app.inject({
      method: "POST",
      url: `/v1/nf/issues/${emit.json().issue_id}/cancel`,
      headers: { authorization: `Bearer ${md.token}` },
      payload: { justificativa: "Cancelamento homologacao H3 Fase 9 QA integral." },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe("cancelled");
    await app.close();
  });

  it("FQ-04: paridade API vs canal — 3 municípios piloto", async () => {
    const app = await buildApp();
    for (const m of PILOT_MUNICIPIOS) {
      const suffix = `${m.code}-${Date.now()}`;
      const api = await emitViaApi(
        app,
        md.token,
        buildEmitPayload(md, m.code, `fq-par-api-${suffix}`),
      );
      const channel = await emitViaChannel(app, md, m.code, `fq-par-ch-${suffix}`);
      expect(api.json().status).toBe("authorized");
      expect(channel.json().status).toBe("authorized");
    }
    await app.close();
  });

  describe("Regressão funcional — ciclo 1", () => {
    it("FQ-R1: smoke API + admin + canal", async () => {
      const app = await buildApp();
      await runRegressionSmoke(app, md, "r1");
      await app.close();
    });
  });

  describe("Regressão funcional — ciclo 2", () => {
    it("FQ-R2: smoke API + admin + canal (repetição)", async () => {
      const app = await buildApp();
      await runRegressionSmoke(app, md, "r2");
      await app.close();
    });
  });

  it(`FQ-05: carga fila — ${LOAD_BATCH_SIZE} emissões sequenciais sem falha`, async () => {
    const app = await buildApp();
    const started = Date.now();
    let authorized = 0;

    for (let i = 0; i < LOAD_BATCH_SIZE; i++) {
      const ibge = PILOT_MUNICIPIOS[i % PILOT_MUNICIPIOS.length]!.code;
      const res = await emitViaApi(
        app,
        md.token,
        buildEmitPayload(md, ibge, `fq-load-${Date.now()}-${i}`, 100000 + i),
      );
      expect(res.statusCode).toBe(202);
      if (res.json().status === "authorized") authorized++;
    }

    const elapsedMs = Date.now() - started;
    expect(authorized).toBe(LOAD_BATCH_SIZE);
    expect(elapsedMs).toBeLessThan(120_000);
    await app.close();
  }, 120_000);
});
