import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { resolveMunicipioIbgeFromDb } from "../src/modules/channel/ibge-lookup.service.js";
import { channelHeaders } from "./helpers/channel-setup.js";

describe("Release 19 — canal com IA conversacional", () => {
  beforeAll(async () => {
    await runMigrations();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("R19-01: resolve Atibaia via tabela ibge_municipios", async () => {
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@piloto.local", password: "changeme" },
    });
    const tenantId = login.json().tenant_id;

    const ibge = await withTenant(tenantId, (db) =>
      resolveMunicipioIbgeFromDb(db, "prestação em Atibaia"),
    );
    expect(ibge).toBe("3504107");
    await app.close();
  });

  it("R19-02: inbound linguagem natural retorna sessão (sem LLM key = regex parcial)", async () => {
    const app = await buildApp();
    const phone = `+55114${String(Date.now()).slice(-8)}`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/channel/inbound",
      headers: channelHeaders(),
      payload: {
        phone_e164: phone,
        message_id: `ai-${Date.now()}`,
        text: "preciso emitir pro cliente João da construtora ABC, foi R$ 3.500 de outubro em Atibaia",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session_id).toBeTruthy();
    await app.close();
  });

  it("R19-03: shouldAttemptLlmFallback false sem OPENAI_API_KEY", async () => {
    const { shouldAttemptLlmFallback } = await import(
      "../src/modules/channel/llm-extraction.service.js"
    );
    expect(
      shouldAttemptLlmFallback(
        "preciso emitir pro cliente João da construtora ABC, foi R$ 3.500",
        0,
        {
          hasConfirm: false,
          hasCancel: false,
          hasHelp: false,
          socialOnly: false,
          intents: ["unknown"],
        },
      ),
    ).toBe(false);
  });
});
