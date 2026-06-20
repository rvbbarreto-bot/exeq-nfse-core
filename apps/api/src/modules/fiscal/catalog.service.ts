import type {
  CreateFiscalProfileInput,
  CreateMunicipalTaxRuleInput,
  PublishChecklist,
  UpdateFiscalProfileInput,
  UpdateMunicipalTaxRuleInput,
} from "@exeq/shared";
import {
  assertCatalogEditable,
  assertPublishGatesComplete,
  normalizePublishChecklist,
  parseCatalogCsv,
  nextCatalogVersion,
} from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { NotFoundError } from "../master-data/master-data.service.js";
import { mapCsvRowsToRules } from "./catalog-import.mapper.js";

export class CatalogNotEditableError extends Error {
  constructor() {
    super("CATALOG_NOT_EDITABLE");
    this.name = "CatalogNotEditableError";
  }
}

export class CatalogEmptyError extends Error {
  constructor() {
    super("CATALOG_EMPTY");
    this.name = "CatalogEmptyError";
  }
}

export async function listFiscalProfiles(db: Sql, tenantId: string) {
  return db`
    SELECT id, name, tax_regime, iss_retention_policy, status, created_at, updated_at
    FROM exeq_core.fiscal_profiles
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY name
  `;
}

export async function createFiscalProfile(
  db: Sql,
  tenantId: string,
  input: CreateFiscalProfileInput,
) {
  const [row] = await db`
    INSERT INTO exeq_core.fiscal_profiles (tenant_id, name, tax_regime, iss_retention_policy)
    VALUES (
      ${tenantId}::uuid, ${input.name}, ${input.tax_regime}::exeq_core.tax_regime,
      ${input.iss_retention_policy}
    )
    RETURNING id, name, tax_regime, iss_retention_policy, status, created_at, updated_at
  `;
  return row;
}

export async function getFiscalProfile(db: Sql, tenantId: string, id: string) {
  const [row] = await db`
    SELECT id, name, tax_regime, iss_retention_policy, status, created_at, updated_at
    FROM exeq_core.fiscal_profiles
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
  `;
  if (!row) throw new NotFoundError("FISCAL_PROFILE");
  return row;
}

export async function updateFiscalProfile(
  db: Sql,
  tenantId: string,
  id: string,
  input: UpdateFiscalProfileInput,
) {
  const current = await getFiscalProfile(db, tenantId, id);
  const [row] = await db`
    UPDATE exeq_core.fiscal_profiles SET
      name = ${input.name ?? current.name},
      tax_regime = ${(input.tax_regime ?? current.tax_regime) as string}::exeq_core.tax_regime,
      iss_retention_policy = ${input.iss_retention_policy ?? current.iss_retention_policy},
      status = ${input.status ?? current.status},
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
    RETURNING id, name, tax_regime, iss_retention_policy, status, created_at, updated_at
  `;
  return row;
}

export async function listCatalogs(db: Sql, tenantId: string) {
  return db`
    SELECT id, version, status, published_at, publish_checklist, created_at
    FROM exeq_core.tax_rule_catalogs
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY version DESC
  `;
}

export async function createDraftCatalog(db: Sql, tenantId: string) {
  const [maxRow] = await db<{ max: number | null }[]>`
    SELECT MAX(version) AS max FROM exeq_core.tax_rule_catalogs
    WHERE tenant_id = ${tenantId}::uuid
  `;
  const version = nextCatalogVersion(maxRow?.max ?? 0);

  const [row] = await db`
    INSERT INTO exeq_core.tax_rule_catalogs (tenant_id, version, status)
    VALUES (${tenantId}::uuid, ${version}, 'draft')
    RETURNING id, version, status, published_at, publish_checklist, created_at
  `;
  return row;
}

export async function getCatalog(db: Sql, tenantId: string, catalogId: string) {
  const [row] = await db`
    SELECT id, version, status, published_at, publish_checklist, created_at
    FROM exeq_core.tax_rule_catalogs
    WHERE tenant_id = ${tenantId}::uuid AND id = ${catalogId}::uuid
  `;
  if (!row) throw new NotFoundError("CATALOG");
  return row;
}

export async function publishCatalog(db: Sql, tenantId: string, catalogId: string) {
  const catalog = await getCatalog(db, tenantId, catalogId);
  try {
    assertCatalogEditable(catalog.status);
  } catch {
    throw new CatalogNotEditableError();
  }

  const [countRow] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM exeq_core.municipal_tax_rules
    WHERE tenant_id = ${tenantId}::uuid AND catalog_id = ${catalogId}::uuid
  `;
  if (Number(countRow!.count) === 0) throw new CatalogEmptyError();

  const checklist = normalizePublishChecklist(
    catalog.publish_checklist as Partial<PublishChecklist> | null,
  );
  assertPublishGatesComplete(checklist);

  await db`
    UPDATE exeq_core.tax_rule_catalogs
    SET status = 'superseded'
    WHERE tenant_id = ${tenantId}::uuid AND status = 'published'
  `;

  const [published] = await db`
    UPDATE exeq_core.tax_rule_catalogs
    SET status = 'published', published_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${catalogId}::uuid
    RETURNING id, version, status, published_at, publish_checklist, created_at
  `;
  return published;
}

export async function getPublishChecklist(db: Sql, tenantId: string, catalogId: string) {
  const catalog = await getCatalog(db, tenantId, catalogId);
  return normalizePublishChecklist(catalog.publish_checklist as Partial<PublishChecklist> | null);
}

export async function updatePublishChecklist(
  db: Sql,
  tenantId: string,
  catalogId: string,
  input: Partial<PublishChecklist>,
) {
  const catalog = await getCatalog(db, tenantId, catalogId);
  try {
    assertCatalogEditable(catalog.status);
  } catch {
    throw new CatalogNotEditableError();
  }

  const merged = normalizePublishChecklist({
    ...(catalog.publish_checklist as Partial<PublishChecklist>),
    ...input,
  });

  const [row] = await db`
    UPDATE exeq_core.tax_rule_catalogs
    SET publish_checklist = ${db.json(merged)}
    WHERE tenant_id = ${tenantId}::uuid AND id = ${catalogId}::uuid
    RETURNING id, version, status, published_at, publish_checklist, created_at
  `;
  return { checklist: merged, catalog: row };
}

export type ImportCatalogRulesResult = {
  imported: number;
  skipped: number;
  parse_errors: { line: number; message: string }[];
  map_errors: { line: number; message: string }[];
};

export async function importCatalogRulesFromCsv(
  db: Sql,
  tenantId: string,
  catalogId: string,
  csvContent: string,
): Promise<ImportCatalogRulesResult> {
  const catalog = await getCatalog(db, tenantId, catalogId);
  try {
    assertCatalogEditable(catalog.status);
  } catch {
    throw new CatalogNotEditableError();
  }

  const { rows, errors: parseErrors } = parseCatalogCsv(csvContent);
  const profiles = await listFiscalProfiles(db, tenantId);
  const { rules, errors: mapErrors } = mapCsvRowsToRules(
    rows,
    profiles.map((p) => ({ id: p.id as string, name: p.name as string })),
  );

  let imported = 0;
  for (const rule of rules) {
    await addCatalogRule(db, tenantId, catalogId, rule);
    imported++;
  }

  if (imported > 0) {
    await updatePublishChecklist(db, tenantId, catalogId, { csv_validated: true });
  }

  return {
    imported,
    skipped: mapErrors.length + parseErrors.length,
    parse_errors: parseErrors,
    map_errors: mapErrors,
  };
}

export async function listCatalogRules(db: Sql, tenantId: string, catalogId: string) {
  await getCatalog(db, tenantId, catalogId);
  return db`
    SELECT id, fiscal_profile_id, ibge_code, municipio_nome, uf, service_code, service_description,
           tax_regime, iss_rate, iss_retained, irrf_rate, pis_rate, cofins_rate, csll_rate,
           simples_codigo_tributacao, valid_from, valid_to, priority, observacao_contador, created_at
    FROM exeq_core.municipal_tax_rules
    WHERE tenant_id = ${tenantId}::uuid AND catalog_id = ${catalogId}::uuid
    ORDER BY ibge_code, service_code, tax_regime, valid_from
  `;
}

export async function addCatalogRule(
  db: Sql,
  tenantId: string,
  catalogId: string,
  input: CreateMunicipalTaxRuleInput,
) {
  const catalog = await getCatalog(db, tenantId, catalogId);
  try {
    assertCatalogEditable(catalog.status);
  } catch {
    throw new CatalogNotEditableError();
  }
  await getFiscalProfile(db, tenantId, input.fiscal_profile_id);

  const [row] = await db`
    INSERT INTO exeq_core.municipal_tax_rules (
      tenant_id, catalog_id, fiscal_profile_id,
      ibge_code, municipio_nome, uf, service_code, service_description, tax_regime,
      iss_rate, iss_retained, irrf_rate, pis_rate, cofins_rate, csll_rate,
      simples_codigo_tributacao, valid_from, valid_to, priority, observacao_contador
    ) VALUES (
      ${tenantId}::uuid, ${catalogId}::uuid, ${input.fiscal_profile_id}::uuid,
      ${input.ibge_code}, ${input.municipio_nome}, ${input.uf},
      ${input.service_code}, ${input.service_description}, ${input.tax_regime}::exeq_core.tax_regime,
      ${input.iss_rate}, ${input.iss_retained},
      ${input.irrf_rate}, ${input.pis_rate}, ${input.cofins_rate}, ${input.csll_rate},
      ${input.simples_codigo_tributacao ?? null},
      ${input.valid_from}::date, ${input.valid_to ?? null}::date,
      ${input.priority}, ${input.observacao_contador ?? null}
    )
    RETURNING id, fiscal_profile_id, ibge_code, municipio_nome, uf, service_code, service_description,
              tax_regime, iss_rate, iss_retained, irrf_rate, pis_rate, cofins_rate, csll_rate,
              simples_codigo_tributacao, valid_from, valid_to, priority, observacao_contador, created_at
  `;
  return row;
}

export async function deleteCatalogRule(
  db: Sql,
  tenantId: string,
  catalogId: string,
  ruleId: string,
) {
  const catalog = await getCatalog(db, tenantId, catalogId);
  try {
    assertCatalogEditable(catalog.status);
  } catch {
    throw new CatalogNotEditableError();
  }

  const result = await db`
    DELETE FROM exeq_core.municipal_tax_rules
    WHERE tenant_id = ${tenantId}::uuid AND catalog_id = ${catalogId}::uuid AND id = ${ruleId}::uuid
    RETURNING id
  `;
  if (!result[0]) throw new NotFoundError("RULE");
  return { deleted: true };
}

export async function updateCatalogRule(
  db: Sql,
  tenantId: string,
  catalogId: string,
  ruleId: string,
  input: UpdateMunicipalTaxRuleInput,
) {
  const catalog = await getCatalog(db, tenantId, catalogId);
  try {
    assertCatalogEditable(catalog.status);
  } catch {
    throw new CatalogNotEditableError();
  }

  const [current] = await db`
    SELECT * FROM exeq_core.municipal_tax_rules
    WHERE tenant_id = ${tenantId}::uuid AND catalog_id = ${catalogId}::uuid AND id = ${ruleId}::uuid
  `;
  if (!current) throw new NotFoundError("RULE");

  const merged = { ...current, ...input };
  if (input.fiscal_profile_id) await getFiscalProfile(db, tenantId, input.fiscal_profile_id);

  const [row] = await db`
    UPDATE exeq_core.municipal_tax_rules SET
      fiscal_profile_id = ${(merged.fiscal_profile_id ?? current.fiscal_profile_id) as string}::uuid,
      ibge_code = ${merged.ibge_code ?? current.ibge_code},
      municipio_nome = ${merged.municipio_nome ?? current.municipio_nome},
      uf = ${merged.uf ?? current.uf},
      service_code = ${merged.service_code ?? current.service_code},
      service_description = ${merged.service_description ?? current.service_description},
      tax_regime = ${(merged.tax_regime ?? current.tax_regime) as string}::exeq_core.tax_regime,
      iss_rate = ${merged.iss_rate ?? current.iss_rate},
      iss_retained = ${merged.iss_retained ?? current.iss_retained},
      irrf_rate = ${merged.irrf_rate ?? current.irrf_rate},
      pis_rate = ${merged.pis_rate ?? current.pis_rate},
      cofins_rate = ${merged.cofins_rate ?? current.cofins_rate},
      csll_rate = ${merged.csll_rate ?? current.csll_rate},
      simples_codigo_tributacao = ${merged.simples_codigo_tributacao ?? current.simples_codigo_tributacao ?? null},
      valid_from = ${(merged.valid_from ?? current.valid_from) as string}::date,
      valid_to = ${(merged.valid_to ?? current.valid_to ?? null) as string | null}::date,
      priority = ${merged.priority ?? current.priority},
      observacao_contador = ${merged.observacao_contador ?? current.observacao_contador ?? null}
    WHERE tenant_id = ${tenantId}::uuid AND id = ${ruleId}::uuid
    RETURNING id, fiscal_profile_id, ibge_code, municipio_nome, uf, service_code, service_description,
              tax_regime, iss_rate, iss_retained, irrf_rate, pis_rate, cofins_rate, csll_rate,
              simples_codigo_tributacao, valid_from, valid_to, priority, observacao_contador, created_at
  `;
  return row;
}
