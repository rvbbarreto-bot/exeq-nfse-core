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
import { setupEmissionMasterData } from "./helpers/emission-setup.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Fase 7 — admin operacao API (listagem + stats)", () => {
  let token: string;
  let providerId: string;
  let customerId: string;
  let serviceId: string;

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
    providerId = md.providerId;
    customerId = md.customerId;
    serviceId = md.serviceId;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await restoreSeedPublishedCatalog();
    await closeDb();
  });

  it("FA-01: lista emissoes com filtros", async () => {
    const app = await buildApp();
    const emit = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: `fa-list-${Date.now()}`,
        provider_id: providerId,
        customer_id: customerId,
        service_id: serviceId,
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 100000,
      },
    });
    expect(emit.statusCode).toBe(202);

    const list = await app.inject({
      method: "GET",
      url: "/v1/nf/issues?status=authorized&ibge_code=3504107",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);
    await app.close();
  });

  it("FA-02: stats dashboard retorna agregados", async () => {
    const app = await buildApp();
    const stats = await app.inject({
      method: "GET",
      url: "/v1/nf/issues/stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().total).toBeGreaterThan(0);
    expect(stats.json().by_status.authorized).toBeGreaterThan(0);
    expect(stats.json().pilot_municipios).toHaveLength(4);
    await app.close();
  });
});
