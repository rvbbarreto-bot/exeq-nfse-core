import { config } from "dotenv";
import path from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Fase 3 — import CSV + governanca", () => {
  let token: string;
  let catalogId: string;

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

  it("importa CSV piloto em catalogo draft", async () => {
    const app = await buildApp();

    const draft = await app.inject({
      method: "POST",
      url: "/v1/fiscal/catalogs",
      headers: { authorization: `Bearer ${token}` },
    });
    catalogId = draft.json().id;

    const csvPath = path.resolve(process.cwd(), "tests/fixtures/catalog-import-pilot.csv");
    const csv = readFileSync(csvPath, "utf8");

    const imported = await app.inject({
      method: "POST",
      url: `/v1/fiscal/catalogs/${catalogId}/rules/import`,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
      },
      payload: csv,
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json().imported).toBeGreaterThan(0);

    const checklist = await app.inject({
      method: "GET",
      url: `/v1/fiscal/catalogs/${catalogId}/publish-checklist`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(checklist.json().checklist.csv_validated).toBe(true);

    await app.close();
  });

  it("bloqueia publicacao sem checklist completo", async () => {
    const app = await buildApp();
    const publish = await app.inject({
      method: "POST",
      url: `/v1/fiscal/catalogs/${catalogId}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(publish.statusCode).toBe(422);
    expect(publish.json().error).toBe("PUBLISH_GATES_INCOMPLETE");
    await app.close();
  });
});
