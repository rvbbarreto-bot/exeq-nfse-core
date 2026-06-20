import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { resetAuthRateLimitForTests } from "../src/plugins/rate-limit-auth.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

describe("Rate limit — POST /v1/auth/login", () => {
  let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_AUTH = "3";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    await runMigrations();
    await runSeed();
    const { buildApp } = await import("../src/app.js");
    app = await buildApp();
  }, 60_000);

  afterAll(async () => {
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX_AUTH;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    await app.close();
    await closeDb();
  });

  beforeEach(() => {
    resetAuthRateLimitForTests();
  });

  it("permite até MAX_AUTH tentativas no mesmo IP", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "admin@piloto.local", password: "wrong1" },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it("bloqueia com 429 após exceder MAX_AUTH", async () => {
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "admin@piloto.local", password: "wrong1" },
      });
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe("rate_limit_exceeded");
  });
});
