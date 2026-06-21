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
  "servico",
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

/** Palavras significativas do hint (sem stopwords). */
export function extractSignificantHintWords(hint: string): string[] {
  let normalized = normalizeServiceHint(hint)
    .replace(/^(?:o\s+)?servi[cç]o\s+(?:é|e)\s+(?:servi[cç]o\s+)?/i, "")
    .replace(/^(?:servi[cç]o|servico)\s+/i, "")
    .trim();

  return normalized
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/** @deprecated Prefer extractSignificantHintWords + scoreServiceDescriptionForHint */
export function expandServiceHintTokens(hint: string): string[] {
  const words = extractSignificantHintWords(hint);
  const expanded = new Set<string>();
  for (const word of words) {
    expanded.add(word);
    for (const synonym of TOKEN_SYNONYMS[word] ?? []) {
      expanded.add(normalizeServiceHint(synonym));
    }
  }
  return [...expanded];
}

/** Pontua quantas palavras significativas do hint casam na descrição (com sinônimos). */
export function scoreServiceDescriptionForHint(
  description: string,
  significantWords: string[],
): number {
  if (significantWords.length === 0) return 0;
  const desc = normalizeServiceHint(description);
  let score = 0;
  for (const word of significantWords) {
    const variants = new Set<string>([word]);
    for (const synonym of TOKEN_SYNONYMS[word] ?? []) {
      variants.add(normalizeServiceHint(synonym));
    }
    if ([...variants].some((v) => desc.includes(v))) score += 1;
  }
  return score;
}

/** @deprecated */
export function scoreServiceDescription(description: string, tokens: string[]): number {
  return scoreServiceDescriptionForHint(description, extractSignificantHintWords(tokens.join(" ")));
}

export function minScoreForSignificantWords(wordCount: number): number {
  if (wordCount <= 1) return 1;
  return wordCount;
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
  hint: string,
): ServiceCatalogMatch[] {
  const words = extractSignificantHintWords(hint);
  if (words.length === 0) return [];

  const minScore = minScoreForSignificantWords(words.length);
  const ranked = services
    .map((service) => ({
      service,
      score: scoreServiceDescriptionForHint(service.description, words),
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

  const words = extractSignificantHintWords(hint);
  if (words.length === 0) return [];

  const allServices = await loadActiveServices(db, tenantId);
  return rankByHintTokens(allServices, hint).slice(0, limit);
}

export async function resolveServiceFromHint(
  db: Sql,
  tenantId: string,
  hint: string,
): Promise<ServiceHintResolution> {
  const matches = await findServicesByHint(db, tenantId, hint, 5);
  if (matches.length === 0) return {};

  const uniqueIds = new Set(matches.map((m) => m.id));
  if (uniqueIds.size === 1) {
    return {
      service_id: matches[0]!.id,
      service_code: matches[0]!.service_code,
    };
  }

  const uniqueCodes = new Set(matches.map((m) => m.service_code));
  if (uniqueCodes.size === 1) {
    return {
      service_id: matches[0]!.id,
      service_code: matches[0]!.service_code,
    };
  }

  if (matches.length === 1) {
    return {
      service_id: matches[0]!.id,
      service_code: matches[0]!.service_code,
    };
  }
  return { ambiguous_matches: matches.slice(0, 3) };
}
