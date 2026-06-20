import { getMigrationDb } from "../../src/db/client.js";
import { ensureBarueriCatalogRules, ensureSantoAndreCatalogRules } from "../../src/db/seed.js";

/** Garante catálogo seed publicado (P0 + extensões piloto) — idempotente para QA/CI. */
export async function restoreSeedPublishedCatalog(tenantSlug = "piloto-sp"): Promise<void> {
  const db = getMigrationDb();

  const [tenant] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) return;

  const tenantId = tenant.id;

  const [seedCatalog] = await db<{ id: string }[]>`
    SELECT c.id
    FROM exeq_core.tax_rule_catalogs c
    WHERE c.tenant_id = ${tenantId}::uuid
      AND c.version = 1
    LIMIT 1
  `;
  if (!seedCatalog) return;

  await db`
    UPDATE exeq_core.tax_rule_catalogs
    SET status = 'superseded', published_at = NULL
    WHERE tenant_id = ${tenantId}::uuid AND status = 'published'
  `;

  await db`
    UPDATE exeq_core.tax_rule_catalogs
    SET status = 'published', published_at = COALESCE(published_at, now())
    WHERE id = ${seedCatalog.id}::uuid
  `;

  await ensureBarueriCatalogRules(db, tenantSlug);
  await ensureSantoAndreCatalogRules(db, tenantSlug);
}
