process.env.FOCUS_MOCK = "true";
process.env.RECEITA_DAS_MOCK = "true";

import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, getDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

function uniqueCompetencia(): string {
  const tick = Date.now();
  const year = 2020 + (tick % 50);
  const month = String((Math.floor(tick / 1000) % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

describe("Merge DAS Fase 1 — API guias", () => {
  let adminToken: string;
  let tenantId: string;
  let providerId: string;

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
    expect(login.statusCode).toBe(200);
    adminToken = login.json().access_token;
    tenantId = login.json().tenant_id;

    const [provider] = await withTenant(tenantId, (db) =>
      db<{ id: string }[]>`
        SELECT id FROM exeq_core.providers WHERE tenant_id = ${tenantId}::uuid LIMIT 1
      `,
    );
    providerId = provider!.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("POST /v1/das/emitir cria guia DAS mock", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/das/emitir",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        provider_id: providerId,
        tipo_guia: "DAS",
        competencia: uniqueCompetencia(),
        idempotency_key: `test-das-${Date.now()}`,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.guia.status).toBe("DISPONIVEL");
    expect(body.guia.tipo_guia).toBe("DAS");
    expect(body.guia.valor_total).toBeGreaterThan(0);
    expect(body.guia.linha_digitavel).toBeTruthy();
  });

  it("GET /v1/das/guias lista guias emitidas", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/das/guias",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().guias.length).toBeGreaterThan(0);
  });

  it("POST /v1/das/emitir idempotente retorna deduplicated", async () => {
    const app = await buildApp();
    const key = `test-das-dedup-${Date.now()}`;
    const competencia = uniqueCompetencia();
    const payload = {
      provider_id: providerId,
      tipo_guia: "DAS",
      competencia,
      idempotency_key: key,
    };

    const first = await app.inject({
      method: "POST",
      url: "/v1/das/emitir",
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/v1/das/emitir",
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().deduplicated).toBe(true);
    expect(second.json().guia.id).toBe(first.json().guia.id);
  });
});
