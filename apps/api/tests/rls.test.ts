import { config } from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { runSeed } from "../src/db/seed.js";
import { expectedSeedPublishedRuleCount } from "./helpers/expected-seed-rule-count.js";
import { restoreSeedPublishedCatalog } from "./helpers/restore-seed-catalog.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env") });

describe("RLS — isolamento multi-tenant", () => {
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    await runMigrations();
    await runSeed();

    const db = getDb();
    const rows = await db<{ id: string; slug: string }[]>`
      SELECT id, slug FROM exeq_core.tenants ORDER BY slug
    `;
    tenantA = rows.find((r) => r.slug === "piloto-sp")!.id;

    const [other] = await db<{ id: string }[]>`
      INSERT INTO exeq_core.tenants (slug, legal_name, status)
      VALUES ('outro-tenant', 'Outro Tenant QA', 'active')
      ON CONFLICT (slug) DO UPDATE SET legal_name = EXCLUDED.legal_name
      RETURNING id
    `;
    tenantB = other!.id;
    await restoreSeedPublishedCatalog();
  }, 60_000);

  afterAll(async () => {
    await closeDb();
  });

  it("tenant A ve regras fiscais; tenant B nao ve catalogo do A", async () => {
    const db = getDb();

    const rulesA = await db.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
      return tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM exeq_core.municipal_tax_rules r
        JOIN exeq_core.tax_rule_catalogs c ON c.id = r.catalog_id
        WHERE c.status = 'published'
      `;
    });

    const rulesB = await db.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantB}, true)`;
      return tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM exeq_core.municipal_tax_rules
      `;
    });

    expect(Number(rulesA[0]!.count)).toBe(await expectedSeedPublishedRuleCount());
    expect(Number(rulesB[0]!.count)).toBe(0);
  });
});
