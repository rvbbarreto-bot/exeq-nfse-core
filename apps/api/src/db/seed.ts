import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogP0Schema,
  type CatalogP0,
  PILOT_MUNICIPIO_BARUERI,
  PILOT_MUNICIPIO_SANTO_ANDRE,
} from "@exeq/shared";
import { env } from "../config/env.js";
import { getDb, getMigrationDb, closeDb, type Sql } from "./client.js";
import { runMigrations } from "./migrate.js";
import { hashPassword } from "../modules/platform/auth.service.js";
import { encryptSecret } from "../modules/platform/secret-vault.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PILOT_WEBHOOK_SECRET = "sandbox-webhook-secret-piloto";
const PILOT_CHANNEL_TOKEN = "sandbox-channel-token-piloto";

function isCliEntry(): boolean {
  return (
    !!process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  );
}

const BARUERI_CATALOG_FIXTURE = "catalog-3505708-rascunho.json";
const SANTO_ANDRE_CATALOG_FIXTURE = "catalog-3547809-validado.json";
const PILOT_CUSTOMER_DOCUMENT = "52998224725";
const PILOT_CUSTOMER_NAME = "Tomador Homologacao";
const PILOT_PROVIDER_CNPJ = "11222333000181";
const PILOT_PROVIDER_NAME = "Prestador Piloto LTDA";
const PILOT_SERVICE_CODE = "1.01";
const PILOT_SERVICE_DESCRIPTION = "Analise e desenvolvimento de sistemas";

async function insertCatalogRules(
  db: Sql,
  tenantId: string,
  catalogId: string,
  profileId: string,
  rules: CatalogP0["rules"],
): Promise<number> {
  let inserted = 0;
  for (const rule of rules) {
    const { input, expected, metadata } = rule;
    await db`
      INSERT INTO exeq_core.municipal_tax_rules (
        tenant_id, catalog_id, fiscal_profile_id,
        ibge_code, municipio_nome, uf,
        service_code, service_description, tax_regime,
        iss_rate, iss_retained,
        irrf_rate, pis_rate, cofins_rate, csll_rate,
        simples_codigo_tributacao,
        valid_from, priority, observacao_contador
      ) VALUES (
        ${tenantId},
        ${catalogId},
        ${profileId},
        ${input.ibge_code},
        ${input.municipio_nome},
        ${input.uf},
        ${input.service_code},
        ${input.service_description},
        ${input.tax_regime}::exeq_core.tax_regime,
        ${expected.iss_rate},
        ${expected.iss_retained},
        ${expected.irrf_rate},
        ${expected.pis_rate},
        ${expected.cofins_rate},
        ${expected.csll_rate},
        ${expected.simples_codigo_tributacao ?? null},
        ${input.competence_date}::date,
        ${metadata.priority},
        ${metadata.observacao_contador}
      )
    `;
    inserted += 1;
  }
  return inserted;
}

/** Tomador piloto para homolog/UAT/E2E (idempotente). */
export async function ensurePilotCustomer(db: Sql, tenantSlug = "piloto-sp"): Promise<void> {
  const [tenant] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) return;

  const tenantId = tenant.id;
  const [existing] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.customers
    WHERE tenant_id = ${tenantId}::uuid AND document = ${PILOT_CUSTOMER_DOCUMENT}
    LIMIT 1
  `;
  if (existing) return;

  await db`
    INSERT INTO exeq_core.customers (tenant_id, document, document_type, name, address)
    VALUES (
      ${tenantId},
      ${PILOT_CUSTOMER_DOCUMENT},
      'cpf',
      ${PILOT_CUSTOMER_NAME},
      '{}'::jsonb
    )
  `;
  console.log(`Ensured pilot customer ${PILOT_CUSTOMER_NAME} on tenant ${tenantSlug}`);
}

/** Prestador piloto para homolog/UAT/E2E e canal WhatsApp (idempotente). */
export async function ensurePilotProvider(db: Sql, tenantSlug = "piloto-sp"): Promise<void> {
  const [tenant] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) return;

  const tenantId = tenant.id;
  const [existing] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.providers
    WHERE tenant_id = ${tenantId}::uuid AND document = ${PILOT_PROVIDER_CNPJ}
    LIMIT 1
  `;
  if (existing) return;

  await db`
    INSERT INTO exeq_core.providers (
      tenant_id, document, legal_name, municipal_registration, tax_regime, address
    ) VALUES (
      ${tenantId},
      ${PILOT_PROVIDER_CNPJ},
      ${PILOT_PROVIDER_NAME},
      '12345',
      'simples_nacional'::exeq_core.tax_regime,
      '{}'::jsonb
    )
  `;
  console.log(`Ensured pilot provider ${PILOT_PROVIDER_NAME} on tenant ${tenantSlug}`);
}

/** Serviço piloto para homolog/UAT/E2E (idempotente). */
export async function ensurePilotService(db: Sql, tenantSlug = "piloto-sp"): Promise<void> {
  const [tenant] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) return;

  const tenantId = tenant.id;
  const [existing] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.service_catalog_items
    WHERE tenant_id = ${tenantId}::uuid AND service_code = ${PILOT_SERVICE_CODE}
    LIMIT 1
  `;
  if (existing) return;

  await db`
    INSERT INTO exeq_core.service_catalog_items (
      tenant_id, service_code, description, lc116_item
    ) VALUES (
      ${tenantId},
      ${PILOT_SERVICE_CODE},
      ${PILOT_SERVICE_DESCRIPTION},
      ${PILOT_SERVICE_CODE}
    )
  `;
  console.log(`Ensured pilot service ${PILOT_SERVICE_CODE} on tenant ${tenantSlug}`);
}

/** US-FIS-01: regras RASCUNHO Barueri no catálogo publicado do piloto (idempotente). */
export async function ensureBarueriCatalogRules(db: Sql, tenantSlug = "piloto-sp"): Promise<number> {
  const ibge = PILOT_MUNICIPIO_BARUERI.ibge_code;

  const [tenant] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) return 0;

  const tenantId = tenant.id;

  const [{ count }] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM exeq_core.municipal_tax_rules
    WHERE tenant_id = ${tenantId}::uuid AND ibge_code = ${ibge}
  `;
  if (count >= 6) return 0;

  const catalogPath = path.join(
    __dirname,
    `../../fixtures/fiscal-p0/${BARUERI_CATALOG_FIXTURE}`,
  );
  const catalogRaw = JSON.parse(await readFile(catalogPath, "utf-8"));
  const catalog = catalogP0Schema.parse(catalogRaw);

  const [profile] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.fiscal_profiles
    WHERE tenant_id = ${tenantId}::uuid AND name = 'Perfil Piloto SP'
    LIMIT 1
  `;
  if (!profile) return 0;

  const [published] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tax_rule_catalogs
    WHERE tenant_id = ${tenantId}::uuid AND status = 'published'
    ORDER BY version DESC
    LIMIT 1
  `;
  if (!published) return 0;

  const inserted = await insertCatalogRules(db, tenantId, published.id, profile.id, catalog.rules);
  if (inserted > 0) {
    console.log(`Ensured ${inserted} tax rules for Barueri (${ibge}) on tenant ${tenantSlug}`);
  }
  return inserted;
}

/** Sprint 15 — regras VALIDADO_CONTADOR Santo André no catálogo publicado (idempotente). */
export async function ensureSantoAndreCatalogRules(db: Sql, tenantSlug = "piloto-sp"): Promise<number> {
  const ibge = PILOT_MUNICIPIO_SANTO_ANDRE.ibge_code;

  const [tenant] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) return 0;

  const tenantId = tenant.id;

  const [{ count }] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM exeq_core.municipal_tax_rules
    WHERE tenant_id = ${tenantId}::uuid AND ibge_code = ${ibge}
  `;
  if (count >= 6) return 0;

  const catalogPath = path.join(
    __dirname,
    `../../fixtures/fiscal-p0/${SANTO_ANDRE_CATALOG_FIXTURE}`,
  );
  const catalogRaw = JSON.parse(await readFile(catalogPath, "utf-8"));
  const catalog = catalogP0Schema.parse(catalogRaw);

  const [profile] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.fiscal_profiles
    WHERE tenant_id = ${tenantId}::uuid AND name = 'Perfil Piloto SP'
    LIMIT 1
  `;
  if (!profile) return 0;

  const [published] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tax_rule_catalogs
    WHERE tenant_id = ${tenantId}::uuid AND status = 'published'
    ORDER BY version DESC
    LIMIT 1
  `;
  if (!published) return 0;

  const inserted = await insertCatalogRules(db, tenantId, published.id, profile.id, catalog.rules);
  if (inserted > 0) {
    console.log(`Ensured ${inserted} tax rules for Santo André (${ibge}) on tenant ${tenantSlug}`);
  }
  return inserted;
}

async function ensurePilotSecrets(db: Sql, tenantId: string): Promise<void> {
  await db`
    INSERT INTO exeq_core.secret_vault (tenant_id, kind, ciphertext)
    VALUES (${tenantId}, 'focus_token', ${encryptSecret("sandbox-focus-token-placeholder")})
    ON CONFLICT (tenant_id, kind) DO NOTHING
  `;
  await db`
    INSERT INTO exeq_core.secret_vault (tenant_id, kind, ciphertext)
    VALUES (${tenantId}, 'webhook_secret', ${encryptSecret(PILOT_WEBHOOK_SECRET)})
    ON CONFLICT (tenant_id, kind) DO NOTHING
  `;
  await db`
    INSERT INTO exeq_core.secret_vault (tenant_id, kind, ciphertext)
    VALUES (${tenantId}, 'gateway_key', ${encryptSecret("sandbox-gateway-key-placeholder")})
    ON CONFLICT (tenant_id, kind) DO NOTHING
  `;
  await db`
    INSERT INTO exeq_core.secret_vault (tenant_id, kind, ciphertext)
    VALUES (${tenantId}, 'channel_token', ${encryptSecret(PILOT_CHANNEL_TOKEN)})
    ON CONFLICT (tenant_id, kind) DO NOTHING
  `;
}

export async function runSeed(): Promise<void> {
  await runMigrations();
  const db = getMigrationDb();

  const catalogPath = path.join(__dirname, "../../fixtures/fiscal-p0/catalog-p0-validado.json");
  const catalogRaw = JSON.parse(await readFile(catalogPath, "utf-8"));
  const catalog = catalogP0Schema.parse(catalogRaw);

  const existing = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = 'piloto-sp' LIMIT 1
  `;

  if (existing[0]) {
    await ensurePilotSecrets(db, existing[0].id);
    await ensurePilotCustomer(db);
    await ensurePilotProvider(db);
    await ensurePilotService(db);
    await ensureBarueriCatalogRules(db);
    await ensureSantoAndreCatalogRules(db);
    console.log("Seed skipped: tenant piloto-sp already exists");
    return;
  }

  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  await db.begin(async (tx) => {
    const [tenant] = await tx<{ id: string }[]>`
      INSERT INTO exeq_core.tenants (slug, legal_name, document, status)
      VALUES ('piloto-sp', 'Tenant Piloto SP', '00000000000000', 'active')
      RETURNING id
    `;

    const tenantId = tenant!.id;
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    const [adminRole] = await tx<{ id: string }[]>`
      SELECT id FROM exeq_core.roles WHERE code = 'tenant_admin' LIMIT 1
    `;

    const [user] = await tx<{ id: string }[]>`
      INSERT INTO exeq_core.users (tenant_id, email, password_hash, name)
      VALUES (${tenantId}, ${env.SEED_ADMIN_EMAIL}, ${passwordHash}, 'Admin Piloto')
      RETURNING id
    `;

    await tx`
      INSERT INTO exeq_core.user_roles (user_id, role_id)
      VALUES (${user!.id}, ${adminRole!.id})
    `;

    await ensurePilotSecrets(tx, tenantId);

    await tx`
      INSERT INTO exeq_core.customers (tenant_id, document, document_type, name, address)
      VALUES (
        ${tenantId},
        ${PILOT_CUSTOMER_DOCUMENT},
        'cpf',
        ${PILOT_CUSTOMER_NAME},
        '{}'::jsonb
      )
    `;

    await tx`
      INSERT INTO exeq_core.providers (
        tenant_id, document, legal_name, municipal_registration, tax_regime, address
      ) VALUES (
        ${tenantId},
        ${PILOT_PROVIDER_CNPJ},
        ${PILOT_PROVIDER_NAME},
        '12345',
        'simples_nacional'::exeq_core.tax_regime,
        '{}'::jsonb
      )
    `;

    await tx`
      INSERT INTO exeq_core.service_catalog_items (
        tenant_id, service_code, description, lc116_item
      ) VALUES (
        ${tenantId},
        ${PILOT_SERVICE_CODE},
        ${PILOT_SERVICE_DESCRIPTION},
        ${PILOT_SERVICE_CODE}
      )
    `;

    const [profile] = await tx<{ id: string }[]>`
      INSERT INTO exeq_core.fiscal_profiles (tenant_id, name, tax_regime, status)
      VALUES (${tenantId}, 'Perfil Piloto SP', 'simples_nacional', 'active')
      RETURNING id
    `;

    const [cat] = await tx<{ id: string }[]>`
      INSERT INTO exeq_core.tax_rule_catalogs (tenant_id, version, status, published_at)
      VALUES (${tenantId}, ${catalog.version}, 'published', now())
      RETURNING id
    `;

    const baseRules = await insertCatalogRules(
      tx,
      tenantId,
      cat!.id,
      profile!.id,
      catalog.rules,
    );

    const barueriPath = path.join(__dirname, `../../fixtures/fiscal-p0/${BARUERI_CATALOG_FIXTURE}`);
    const barueriRaw = JSON.parse(await readFile(barueriPath, "utf-8"));
    const barueriCatalog = catalogP0Schema.parse(barueriRaw);
    const barueriRules = await insertCatalogRules(
      tx,
      tenantId,
      cat!.id,
      profile!.id,
      barueriCatalog.rules,
    );

    const santoAndrePath = path.join(
      __dirname,
      `../../fixtures/fiscal-p0/${SANTO_ANDRE_CATALOG_FIXTURE}`,
    );
    const santoAndreRaw = JSON.parse(await readFile(santoAndrePath, "utf-8"));
    const santoAndreCatalog = catalogP0Schema.parse(santoAndreRaw);
    const santoAndreRules = await insertCatalogRules(
      tx,
      tenantId,
      cat!.id,
      profile!.id,
      santoAndreCatalog.rules,
    );

    console.log(
      `Seeded tenant piloto-sp with ${baseRules + barueriRules + santoAndreRules} tax rules (P0 + Barueri + Santo André)`,
    );
  });
}

if (isCliEntry()) {
  runSeed()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
