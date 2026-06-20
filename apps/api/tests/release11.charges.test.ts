import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Release 1.1 — charges API", () => {
  let token: string;
  let customerId: string;

  beforeAll(async () => {
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
    await closeDb();
  });

  it("RC-05: list charges com paginação e filtro status", async () => {
    const app = await buildApp();
    const key = `rc11-${Date.now()}`;
    await app.inject({
      method: "POST",
      url: "/v1/charges",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idempotency_key: key,
        customer_id: customerId,
        amount_cents: 10000,
        due_date: "2026-09-01",
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/v1/charges?status=pending&limit=5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThan(0);
    expect(list.json().items[0].amount_cents).toBeTypeOf("number");
    expect("next_cursor" in list.json()).toBe(true);

    const stats = await app.inject({
      method: "GET",
      url: "/v1/charges/stats",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().pending).toBeGreaterThan(0);
    await app.close();
  });
});
