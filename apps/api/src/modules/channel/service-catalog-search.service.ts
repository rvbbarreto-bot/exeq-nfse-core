import type { Sql } from "../../db/client.js";

export type ServiceCatalogMatch = {
  id: string;
  service_code: string;
  description: string;
};

export type ServiceHintResolution = {
  service_id?: string;
  service_code?: string;
  ambiguous_matches?: ServiceCatalogMatch[];
};

function normalizeHint(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Busca textual no catálogo de serviços do tenant (hint LLM / linguagem natural). */
export async function findServicesByHint(
  db: Sql,
  tenantId: string,
  hint: string,
  limit = 5,
): Promise<ServiceCatalogMatch[]> {
  const term = normalizeHint(hint);
  if (term.length < 2) return [];

  const pattern = `%${term}%`;
  return db<ServiceCatalogMatch[]>`
    SELECT id, service_code, description
    FROM exeq_core.service_catalog_items
    WHERE tenant_id = ${tenantId}::uuid
      AND is_active = true
      AND (
        lower(description) LIKE ${pattern}
        OR lower(service_code) LIKE ${pattern}
        OR replace(lower(service_code), '.', '') LIKE ${pattern.replace(/\./g, "")}
      )
    ORDER BY
      CASE WHEN lower(description) = ${term} THEN 0
           WHEN lower(description) LIKE ${`${term}%`} THEN 1
           ELSE 2 END,
      service_code
    LIMIT ${limit}
  `;
}

export async function resolveServiceFromHint(
  db: Sql,
  tenantId: string,
  hint: string,
): Promise<ServiceHintResolution> {
  const matches = await findServicesByHint(db, tenantId, hint, 5);
  if (matches.length === 0) return {};
  if (matches.length === 1) {
    return {
      service_id: matches[0]!.id,
      service_code: matches[0]!.service_code,
    };
  }
  return { ambiguous_matches: matches.slice(0, 3) };
}
