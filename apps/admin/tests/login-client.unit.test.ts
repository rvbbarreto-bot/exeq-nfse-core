import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { api } from "../src/api/client.js";

describe("Admin API client — login", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            access_token: "tok",
            token_type: "Bearer",
            tenant_id: "00000000-0000-4000-8000-000000000001",
            user: { id: "u1", email: "admin@piloto.local", name: "Admin" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia Content-Type application/json no login", async () => {
    await api.login("admin@piloto.local", "changeme");
    const call = vi.mocked(fetch).mock.calls[0];
    const init = call?.[1] as RequestInit;
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ email: "admin@piloto.local", password: "changeme" }));
  });
});
