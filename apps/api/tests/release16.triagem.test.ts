import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Release 1.6 — triagem e auditoria", () => {
  let token: string;
  let issueId: string;

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
    const list = await app.inject({
      method: "GET",
      url: "/v1/nf/issues?limit=1",
      headers: { authorization: `Bearer ${token}` },
    });
    issueId = list.json().items[0]?.id;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("OP-10: ops summary agrega alertas e stats", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/ops/summary",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.alerts).toBeDefined();
    expect(body.issue_stats.total).toBeGreaterThanOrEqual(0);
    expect(body.charge_stats.total).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it("OP-11: filtro correlation_id em emissões", async () => {
    if (!issueId) return;
    const app = await buildApp();
    const detail = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const correlationId = detail.json().correlation_id as string;
    const filtered = await app.inject({
      method: "GET",
      url: `/v1/nf/issues?limit=10&correlation_id=${correlationId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().items.length).toBeGreaterThanOrEqual(1);
    await app.close();
  });

  it("OP-12: export eventos da emissão", async () => {
    if (!issueId) return;
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/v1/nf/issues/${issueId}/events/export`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.replace(/^\uFEFF/, "")).toContain("event_id,from_status,to_status");
    await app.close();
  });
});
