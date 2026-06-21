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

const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "para",
  "com",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "no",
  "na",
  "nos",
  "nas",
]);

/** Sinônimos comuns em linguagem natural vs catálogo fiscal. */
const TOKEN_SYNONYMS: Record<string, readonly string[]> = {
  software: ["software", "sistemas", "sistema", "programa", "programas", "aplicativo", "aplicativos"],
  sistemas: ["sistemas", "sistema", "software"],
  sistema: ["sistema", "sistemas", "software"],
  programacao: ["programacao", "programação", "desenvolvimento"],
  programação: ["programação", "programacao", "desenvolvimento"],
  desenvolvimento: ["desenvolvimento", "desenvolvimentos"],
  analise: ["analise", "análise"],
  análise: ["análise", "analise"],
  consultoria: ["consultoria", "consultorias"],
};

export function normalizeServiceHint(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Tokens significativos do hint (com sinônimos) para busca fuzzy no catálogo. */
export function expandServiceHintTokens(hint: string): string[] {
  const normalized = normalizeServiceHint(hint);
  const words = normalized.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const expanded = new Set<string>();

  for (const word of words) {
    expanded.add(word);
    for (const synonym of TOKEN_SYNONYMS[word] ?? []) {
      expanded.add(normalizeServiceHint(synonym));
    }
  }

  return [...expanded];
}

export function scoreServiceDescription(description: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const desc = normalizeServiceHint(description);
  let score = 0;
  for (const token of tokens) {
    if (desc.includes(token)) score += 1;
  }
  return score;
}

function minScoreForTokens(tokenCount: number): number {
  if (tokenCount <= 1) return 1;
  return Math.max(2, Math.ceil(tokenCount * 0.6));
}

async function loadActiveServices(db: Sql, tenantId: string): Promise<ServiceCatalogMatch[]> {
  return db<ServiceCatalogMatch[]>`
    SELECT id, service_code, description
    FROM exeq_core.service_catalog_items
    WHERE tenant_id = ${tenantId}::uuid AND is_active = true
    ORDER BY service_code
  `;
}

function rankByHintTokens(
  services: ServiceCatalogMatch[],
  tokens: string[],
): ServiceCatalogMatch[] {
  const minScore = minScoreForTokens(tokens.length);
  const ranked = services
    .map((service) => ({
      service,
      score: scoreServiceDescription(service.description, tokens),
    }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || a.service.service_code.localeCompare(b.service.service_code));

  if (ranked.length === 0) return [];

  const topScore = ranked[0]!.score;
  return ranked.filter((row) => row.score === topScore).map((row) => row.service);
}

/** Busca textual no catálogo de serviços do tenant (hint LLM / linguagem natural). */
export async function findServicesByHint(
  db: Sql,
  tenantId: string,
  hint: string,
  limit = 5,
): Promise<ServiceCatalogMatch[]> {
  const term = normalizeServiceHint(hint);
  if (term.length < 2) return [];

  const pattern = `%${term}%`;
  const phraseMatches = await db<ServiceCatalogMatch[]>`
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

  if (phraseMatches.length > 0) return phraseMatches;

  const tokens = expandServiceHintTokens(hint);
  if (tokens.length === 0) return [];

  const allServices = await loadActiveServices(db, tenantId);
  return rankByHintTokens(allServices, tokens).slice(0, limit);
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
