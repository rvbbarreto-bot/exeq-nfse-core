import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogP0Schema, fiscalP0FixtureSchema } from "@exeq/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const barueriCatalogPath = path.join(
  __dirname,
  "../fixtures/fiscal-p0/catalog-3505708-rascunho.json",
);

describe("Fiscal Barueri — catálogo RASCUNHO (Sprint 8)", () => {
  let token: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();
    await restoreSeedPublishedCatalog();

    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: process.env.SEED_ADMIN_EMAIL ?? "admin@piloto.local",
        password: process.env.SEED_ADMIN_PASSWORD ?? "changeme",
      },
    });
    expect(login.statusCode).toBe(200);
    token = login.json().access_token;
    await app.close();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("carrega 6 regras do fixture Barueri", async () => {
    const raw = JSON.parse(await readFile(barueriCatalogPath, "utf-8"));
    const catalog = catalogP0Schema.parse(raw);
    expect(catalog.rules).toHaveLength(6);
    for (const rule of catalog.rules) {
      fiscalP0FixtureSchema.parse(rule);
      expect(rule.input.ibge_code).toBe("3505708");
    }
  });

  it("resolve 6 casos Barueri via API /v1/tax/resolve", async () => {
    const raw = JSON.parse(await readFile(barueriCatalogPath, "utf-8"));
    const catalog = catalogP0Schema.parse(raw);
    const app = await buildApp();

    for (const fixture of catalog.rules) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tax/resolve",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ibge_code: fixture.input.ibge_code,
          service_code: fixture.input.service_code,
          tax_regime: fixture.input.tax_regime,
          competence_date: fixture.input.competence_date,
          fiscal_profile_name: fixture.input.fiscal_profile_name,
        },
      });

      expect(
        response.statusCode,
        `${fixture.input.service_code} ${fixture.input.tax_regime}`,
      ).toBe(200);
      expect(response.json().resolved).toEqual(fixture.expected);
    }

    await app.close();
  });
});
