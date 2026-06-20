import { describe, expect, it } from "vitest";
import {
  isRateLimitEnabled,
  rateLimitMaxAuth,
  rateLimitWindowMs,
  resetAuthRateLimitForTests,
  createAuthRateLimitPreHandler,
} from "./rate-limit-auth.js";

describe("rate-limit-auth", () => {
  it("desabilitado quando RATE_LIMIT_ENABLED=false", () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    expect(isRateLimitEnabled()).toBe(false);
    delete process.env.RATE_LIMIT_ENABLED;
  });

  it("defaults alinhados ao legado", () => {
    delete process.env.RATE_LIMIT_MAX_AUTH;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    expect(rateLimitMaxAuth()).toBe(10);
    expect(rateLimitWindowMs()).toBe(60_000);
  });

  it("preHandler retorna 429 após max", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_AUTH = "2";
    resetAuthRateLimitForTests();

    const handler = createAuthRateLimitPreHandler();
    const reply = {
      code(n: number) {
        this.statusCode = n;
        return this;
      },
      send(body: unknown) {
        this.body = body;
        return this;
      },
      statusCode: 200,
      body: undefined as unknown,
    };

    const req = { ip: "203.0.113.1", url: "/v1/auth/login" };

    await handler(req as never, reply as never);
    await handler(req as never, reply as never);
    await handler(req as never, reply as never);

    expect(reply.statusCode).toBe(429);
    expect((reply.body as { error: string }).error).toBe("rate_limit_exceeded");

    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX_AUTH;
    resetAuthRateLimitForTests();
  });
});
