import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: path.resolve(process.cwd(), "../../.env") });
process.env.GATEWAY_MOCK = "true";
process.env.GATEWAY_SYNC_PROCESSING = "true";

describe("Release 1.7 — gateway cobrança", () => {
  let buildApp: typeof import("../src/app.js").buildApp;
  let closeDb: typeof import("../src/db/client.js").closeDb;
  let runMigrations: typeof import("../src/db/migrate.js").runMigrations;
  let runSeed: typeof import("../src/db/seed.js").runSeed;
  let setPaymentGatewayClient: typeof import("../src/modules/integration/gateway/payment-gateway.client.js").setPaymentGatewayClient;
  let token: string;
  let customerId: string;

  beforeAll(async () => {
    const dbMod = await import("../src/db/client.js");
    const migrateMod = await import("../src/db/migrate.js");
    const seedMod = await import("../src/db/seed.js");
    const gatewayMod = await import("../src/modules/integration/gateway/payment-gateway.client.js");
    const { MockPaymentGatewayClient } = await import(
      "../src/modules/integration/gateway/mock-payment-gateway.client.js"
    );

    closeDb = dbMod.closeDb;
    runMigrations = migrateMod.runMigrations;
    runSeed = seedMod.runSeed;
    setPaymentGatewayClient = gatewayMod.setPaymentGatewayClient;
    setPaymentGatewayClient(new MockPaymentGatewayClient());

    ({ buildApp } = await import("../src/app.js"));
    await runMigrations();
    await runSeed();
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    token = login.json().access_token;
    const customers = await app.inject({
      method: "GET",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${token}` },
    });
    customerId = customers.json().items[0].id;
    await app.close();
  }, 90_000);

  afterAll(async () => {
    setPaymentGatewayClient(null);
    await closeDb();
  });

  it("RG-01: cria cobrança e registra no gateway mock (registered + gateway_ref)", async () => {
    const app = await buildApp();
    const key = `rg17-${Date.now()}`;
    const create = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: key,
        customer_id: customerId,
        amount_cents: 42000,
        due_date: "2026-10-01",
        description: "Sprint 7 gateway",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe("registered");
    expect(create.json().gateway_ref).toMatch(/^mock-/);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${create.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().status).toBe("registered");
    expect(detail.json().gateway_ref).toBe(create.json().gateway_ref);
    expect(detail.json().gateway_sandbox_url).toContain("sandbox.exeq.local/pay/");
    expect(detail.json().gateway_mode).toBe("mock");
    await app.close();
  });

  it("RG-02: idempotência HTTP não duplica registro no gateway", async () => {
    const app = await buildApp();
    const key = `rg17-idem-${Date.now()}`;
    const first = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: key,
        customer_id: customerId,
        amount_cents: 10000,
        due_date: "2026-10-02",
      },
    });
    expect(first.statusCode).toBe(201);
    const ref1 = first.json().gateway_ref as string;

    const dup = await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: key,
        customer_id: customerId,
        amount_cents: 10000,
        due_date: "2026-10-02",
      },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().charge_id).toBe(first.json().id);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/charges/${first.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().gateway_ref).toBe(ref1);
    await app.close();
  });

  it("RG-03: lista cobranças com status registered", async () => {
    const app = await buildApp();
    const list = await app.inject({
      method: "GET",
      url: "/v1/charges?status=registered&limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((c: { status: string }) => c.status === "registered")).toBe(
      true,
    );
    await app.close();
  });
});
