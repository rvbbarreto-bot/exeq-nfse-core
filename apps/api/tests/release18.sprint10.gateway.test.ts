import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

config({ path: path.resolve(process.cwd(), "../../.env") });
process.env.GATEWAY_MOCK = "true";
process.env.GATEWAY_SYNC_PROCESSING = "true";

describe("Sprint 10 — gateway real + vínculo NF↔cobrança", () => {
  let buildApp: typeof import("../src/app.js").buildApp;
  let closeDb: typeof import("../src/db/client.js").closeDb;
  let runMigrations: typeof import("../src/db/migrate.js").runMigrations;
  let runSeed: typeof import("../src/db/seed.js").runSeed;
  let setPaymentGatewayClient: typeof import("../src/modules/integration/gateway/payment-gateway.client.js").setPaymentGatewayClient;
  let restoreSeedPublishedCatalog: typeof import("./helpers/restore-seed-catalog.js").restoreSeedPublishedCatalog;
  let setupEmissionMasterData: typeof import("./helpers/emission-setup.js").setupEmissionMasterData;
  let buildEmitPayload: typeof import("./helpers/qa-setup.js").buildEmitPayload;
  let emitViaApi: typeof import("./helpers/qa-setup.js").emitViaApi;

  let token: string;
  let customerId: string;
  let providerId: string;
  let serviceId: string;

  beforeAll(async () => {
    const dbMod = await import("../src/db/client.js");
    const migrateMod = await import("../src/db/migrate.js");
    const seedMod = await import("../src/db/seed.js");
    const gatewayMod = await import("../src/modules/integration/gateway/payment-gateway.client.js");
    const catalogMod = await import("./helpers/restore-seed-catalog.js");
    const emitMod = await import("./helpers/emission-setup.js");
    const qaMod = await import("./helpers/qa-setup.js");
    const { MockPaymentGatewayClient } = await import(
      "../src/modules/integration/gateway/mock-payment-gateway.client.js"
    );

    closeDb = dbMod.closeDb;
    runMigrations = migrateMod.runMigrations;
    runSeed = seedMod.runSeed;
    setPaymentGatewayClient = gatewayMod.setPaymentGatewayClient;
    restoreSeedPublishedCatalog = catalogMod.restoreSeedPublishedCatalog;
    setupEmissionMasterData = emitMod.setupEmissionMasterData;
    buildEmitPayload = qaMod.buildEmitPayload;
    emitViaApi = qaMod.emitViaApi;

    setPaymentGatewayClient(new MockPaymentGatewayClient());
    ({ buildApp } = await import("../src/app.js"));
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
    providerId = md.providerId;
    serviceId = md.serviceId;
    await app.close();
  }, 120_000);

  afterAll(async () => {
    setPaymentGatewayClient(null);
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  async function emitIssue() {
    const app = await buildApp();
    const emit = await emitViaApi(
      app,
      token,
      buildEmitPayload({ providerId, customerId, serviceId }, "3504107", `s10-${Date.now()}`),
    );
    expect(emit.statusCode).toBe(202);
    const issueId = emit.json().issue_id as string;
    expect(issueId).toBeTruthy();
    await app.close();
    return issueId;
  }

  it("RS-01: cria cobrança vinculada à emissão NF", async () => {
    const issueId = await emitIssue();
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `s10-link-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 15000,
        due_date: "2026-11-01",
        nf_issue_id: issueId,
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().nf_issue_id).toBe(issueId);
    expect(create.json().status).toBe("registered");

    const list = await app.inject({
      method: "GET",
      url: `/v1/charges?nf_issue_id=${issueId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].id).toBe(create.json().id);
    await app.close();
  });

  it("RS-02: emissão inexistente retorna 404", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `s10-bad-nf-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 1000,
        due_date: "2026-11-01",
        nf_issue_id: "00000000-0000-0000-0000-000000000099",
      },
    });
    expect(create.statusCode).toBe(404);
    await app.close();
  });

  it("RS-03: segunda cobrança ativa na mesma emissão retorna 409", async () => {
    const issueId = await emitIssue();
    const app = await buildApp();
    const first = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `s10-dup-a-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 1000,
        due_date: "2026-11-01",
        nf_issue_id: issueId,
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `s10-dup-b-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 2000,
        due_date: "2026-11-02",
        nf_issue_id: issueId,
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("NF_ISSUE_ALREADY_LINKED");
    await app.close();
  });

  it("RS-04: registro HTTP persiste gateway_payment_url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          gateway_ref: "gw-http-s10",
          payment_url: "https://sandbox.gateway.exeq.local/pay/gw-http-s10",
        }),
      }),
    );

    const { HttpPaymentGatewayClient } = await import(
      "../src/modules/integration/gateway/http-payment-gateway.client.js"
    );
    setPaymentGatewayClient(new HttpPaymentGatewayClient());

    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `s10-http-${Date.now()}`,
        customer_id: customerId,
        amount_cents: 9900,
        due_date: "2026-11-03",
      },
    });
    expect(create.statusCode).toBe(201);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${create.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().gateway_ref).toBe("gw-http-s10");
    expect(detail.json().gateway_sandbox_url).toBe(
      "https://sandbox.gateway.exeq.local/pay/gw-http-s10",
    );

    setPaymentGatewayClient(
      new (await import("../src/modules/integration/gateway/mock-payment-gateway.client.js"))
        .MockPaymentGatewayClient(),
    );
    vi.unstubAllGlobals();
    await app.close();
  });

  it("RS-05: GET /v1/nf/issues/:id inclui ibge_code (portal UAT-21)", async () => {
    const issueId = await emitIssue();
    const app = await buildApp();
    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().ibge_code).toBe("3504107");
    await app.close();
  });
});
