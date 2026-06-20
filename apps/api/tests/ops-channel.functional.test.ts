import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

describe("Ops — canal WhatsApp (Sprint 1)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    token = login.json().access_token;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("S1-01: GET /v1/ops/channel/sessions exige autenticação", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/ops/channel/sessions" });
    expect(res.statusCode).toBe(401);
  });

  it("S1-02: GET /v1/ops/channel/sessions retorna lista", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/ops/channel/sessions",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it("S1-03: GET /v1/ops/channel/notifications retorna lista", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/ops/channel/notifications",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it("S1-04: readonly bloqueado em ops channel (mesmo padrão RBAC leitura)", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    const readonlyToken = app.jwt.sign({
      sub: login.json().user.id,
      tenant_id: login.json().tenant_id,
      email: "readonly@test.local",
      roles: ["readonly"],
    });
    const res = await app.inject({
      method: "GET",
      url: "/v1/ops/channel/sessions",
      headers: { authorization: `Bearer ${readonlyToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
