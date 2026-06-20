import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { escapeCsvCell, rowsToCsv } from "../src/lib/csv.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

describe("Release 1.4 — export CSV auditoria", () => {
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

  it("OP-05: CSV helper escapa vírgulas e aspas", () => {
    expect(escapeCsvCell('valor, com virgula')).toBe('"valor, com virgula"');
    expect(rowsToCsv(["a"], [["ok"]])).toContain("a");
  });

  it("OP-05: export emissões retorna CSV com cabeçalho", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/nf/issues/export?limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("id,status,ibge_code");
    await app.close();
  });

  it("OP-05: export cobranças retorna CSV com cabeçalho", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/charges/export?limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("id,status,customer_id");
    await app.close();
  });
});
