import { config } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FiscalP0Fixture } from "@exeq/shared";
import { fiscalP0FixtureSchema } from "@exeq/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { closeDb, getDb, withTenant } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";
import { resolveTaxParams } from "../src/modules/fiscal/tax-resolve.service.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matrixDir = path.join(__dirname, "../fixtures/fiscal-p0/matrix");

describe("Fiscal P0 — matriz H1", () => {
  let tenantId: string;
  let token: string;
  let fixtures: FiscalP0Fixture[] = [];

  beforeAll(async () => {
    fixtures = await loadFixtures();
    await runMigrations();
    await runSeed();

    const db = getDb();
    const tenants = await db<{ id: string }[]>`
      SELECT id FROM exeq_core.tenants WHERE slug = 'piloto-sp' LIMIT 1
    `;
    tenantId = tenants[0]!.id;
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

  it("carrega 18 fixtures P0", () => {
    expect(fixtures.length).toBe(18);
  });

  it("resolve todos os casos P0 via API", async () => {
    const app = await buildApp();

    for (const fixture of fixtures) {
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

      expect(response.statusCode, `${fixture.input.ibge_code} ${fixture.input.service_code}`).toBe(
        200,
      );
      expect(response.json().resolved).toEqual(fixture.expected);
    }

    await app.close();
  });

  it("bloqueia emissao sem regra publicada", async () => {
    await expect(
      withTenant(tenantId, (db) =>
        resolveTaxParams(db, tenantId, {
          ibge_code: "3550308",
          service_code: "1.01",
          tax_regime: "simples_nacional",
          competence_date: "2026-06-01",
        }),
      ),
    ).rejects.toMatchObject({ name: "TaxRuleNotFoundError" });
  });
});

async function loadFixtures(): Promise<FiscalP0Fixture[]> {
  const files = (await readdir(matrixDir)).filter((f) => f.endsWith(".json")).sort();
  const fixtures: FiscalP0Fixture[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(matrixDir, file), "utf-8"));
    fixtures.push(fiscalP0FixtureSchema.parse(raw));
  }
  return fixtures;
}
