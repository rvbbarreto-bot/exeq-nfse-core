import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Release 1.5 — hypercare integrado", () => {
  let token: string;

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
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("OP-06: ops alerts retorna contagens", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/ops/alerts",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      issues_failed: expect.any(Number),
      issues_queued: expect.any(Number),
      webhooks_failed: expect.any(Number),
      charges_pending: expect.any(Number),
      charges_registered: expect.any(Number),
    });
    await app.close();
  });

  it("OP-08: export webhooks inbox retorna CSV", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/webhooks/inbox/export?limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("id,status,idempotency_key");
    await app.close();
  });
});
