import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

describe("RBAC — perfil readonly", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;
  let userId: string;
  let readonlyToken: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    const body = login.json();
    tenantId = body.tenant_id;
    userId = body.user.id;
    readonlyToken = app.jwt.sign({
      sub: userId,
      tenant_id: tenantId,
      email: "readonly@test.local",
      roles: ["readonly"],
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("readonly recebe 403 ao criar prestador", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/providers",
      headers: { authorization: `Bearer ${readonlyToken}` },
      payload: {
        document: "11222333000199",
        legal_name: "Prestador RBAC Test",
        tax_regime: "simples_nacional",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("FORBIDDEN");
  });

  it("readonly recebe 403 ao emitir NFS-e", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/nf/issues",
      headers: { authorization: `Bearer ${readonlyToken}` },
      payload: {
        idempotency_key: `rbac-readonly-${Date.now()}`,
        provider_id: "00000000-0000-0000-0000-000000000001",
        customer_id: "00000000-0000-0000-0000-000000000002",
        service_id: "00000000-0000-0000-0000-000000000003",
        ibge_code: "3504107",
        competence_date: "2026-06-01",
        amount_cents: 10000,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("readonly pode listar prestadores", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/providers",
      headers: { authorization: `Bearer ${readonlyToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });
});
