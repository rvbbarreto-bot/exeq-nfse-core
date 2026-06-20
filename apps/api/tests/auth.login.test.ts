import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, getDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Auth — login (gate UAT)", () => {
  beforeAll(async () => {
    await runMigrations();
    await runSeed();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("AUTH-01: login válido retorna token e tenant", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().access_token).toBeTruthy();
    expect(res.json().tenant_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await app.close();
  });

  it("AUTH-02: credenciais inválidas retornam 401", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("INVALID_CREDENTIALS");
    await app.close();
  });

  it("AUTH-03: login após uso de withTenant no pool (regressão RLS 22P02)", async () => {
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    const tenantId = login.json().tenant_id as string;

    await withTenant(tenantId, async (db) => {
      await db`SELECT count(*)::int AS c FROM exeq_core.nf_issue`;
    });

    const again = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().access_token).toBeTruthy();
    await app.close();
  });

  it("AUTH-04: sessão com tenant_id vazio não quebra política RLS", async () => {
    const db = getDb();
    await db`SELECT set_config('app.tenant_id', '', false)`;
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
