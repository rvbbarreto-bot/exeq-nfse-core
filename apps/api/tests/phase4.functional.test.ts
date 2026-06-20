process.env.NF_SYNC_PROCESSING = "true";
process.env.FOCUS_MOCK = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import { setFocusClient, MockFocusClient } from "../src/modules/integration/focus/focus-client.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Fase 4 — emissao NFS-e (funcional)", () => {
  let token: string;
  let providerId: string;
  let customerId: string;
  let serviceId: string;

  beforeAll(async () => {
    setFocusClient(new MockFocusClient());

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

    const provider = await app.inject({
      method: "POST",
      url: "/v1/providers",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        document: "11222333000181",
        legal_name: "Prestador Piloto LTDA",
        tax_regime: "simples_nacional",
        municipal_registration: "12345",
      },
    });
    providerId =
      provider.statusCode === 201 ? provider.json().id : (await listProviders(app, token)).id;

    const customer = await app.inject({
      method: "POST",
      url: "/v1/customers",
      headers: { authorization: `Bearer ${token}` },
      payload: { document: "52998224725", name: "Tomador Funcional" },
    });
    customerId =
      customer.statusCode === 201 ? customer.json().id : (await listCustomers(app, token)).id;

    const service = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        service_code: "1.01",
        description: "Analise e desenvolvimento de sistemas",
        lc116_item: "1.01",
      },
    });
    serviceId =
      service.statusCode === 201 ? service.json().id : (await listServices(app, token)).id;

    await app.close();
  }, 60_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    setFocusClient(null);
    await closeDb();
  });

  it("FN-01: emite NFS-e sandbox mock ponta a ponta (202 -> authorized)", async () => {
    const app = await buildApp();
    const idempotencyKey = `fn01-${Date.now()}`;

    const emit = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: idempotencyKey,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 150000,
      },
    });

    expect(emit.statusCode).toBe(202);
    const issueId = emit.json().issue_id;
    expect(emit.json().status).toBe("authorized");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().status).toBe("authorized");
    expect(detail.json().focus_ref).toMatch(/^exeq-/);
    expect(detail.json().events.length).toBeGreaterThanOrEqual(5);

    await app.close();
  });

  it("FN-02: idempotency retorna 409 com mesmo issue_id", async () => {
    const app = await buildApp();
    const idempotencyKey = `fn02-${Date.now()}`;

    const first = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: idempotencyKey,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 100000,
      },
    });
    const issueId = first.json().issue_id;

    const dup = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: idempotencyKey,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 100000,
      },
    });

    expect(dup.statusCode).toBe(409);
    expect(dup.json().issue_id).toBe(issueId);
    await app.close();
  });

  it("FN-03: rejeita emissao sem regra fiscal (status rejected)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fn03-${Date.now()}`,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3550308",
        competence_date: "2026-06-01",
        amount_cents: 50000,
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("rejected");
    await app.close();
  });
});

async function listProviders(app: Awaited<ReturnType<typeof buildApp>>, authToken: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/providers",
    headers: { authorization: `Bearer ${authToken}` },
  });
  return res.json().items[0];
}

async function listCustomers(app: Awaited<ReturnType<typeof buildApp>>, authToken: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/customers",
    headers: { authorization: `Bearer ${authToken}` },
  });
  return (
    res.json().items.find((c: { name: string }) => c.name === "Tomador Funcional") ??
    res.json().items[0]
  );
}

async function listServices(app: Awaited<ReturnType<typeof buildApp>>, authToken: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/services",
    headers: { authorization: `Bearer ${authToken}` },
  });
  return (
    res.json().items.find((s: { service_code: string }) => s.service_code === "1.01") ??
    res.json().items[0]
  );
}
