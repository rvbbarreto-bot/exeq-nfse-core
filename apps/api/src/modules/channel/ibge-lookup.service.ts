import { resolveMunicipioIbgeFromText } from "@exeq/shared";
import type { Sql } from "../../db/client.js";

export function normalizeMunicipioSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Typo comum de voz/WhatsApp — normaliza antes da busca exata. */
const CITY_TYPO_ALIASES: Record<string, string> = {
  tibaya: "atibaia",
  atibaya: "atibaia",
  "santo andre": "santo andre",
  braganca: "braganca paulista",
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

async function resolveFuzzyFromDb(db: Sql, norm: string): Promise<string | null> {
  const rows = await db<{ ibge_code: string; nome_normalizado: string }[]>`
    SELECT ibge_code, nome_normalizado
    FROM exeq_core.ibge_municipios
    WHERE length(nome_normalizado) >= 4
    LIMIT 800
  `;

  let best: { ibge: string; dist: number } | null = null;
  for (const row of rows) {
    const dist = levenshtein(norm, row.nome_normalizado);
    if (dist > 2) continue;
    if (!best || dist < best.dist) best = { ibge: row.ibge_code, dist };
  }

  return best?.ibge ?? null;
}

/** Busca IBGE no DB; fallback para pilot-municipios.ts (hardcoded). */
export async function resolveMunicipioIbgeFromDb(
  db: Sql,
  cidadeTermoBruto: string,
): Promise<string | null> {
  const normRaw = normalizeMunicipioSearchTerm(cidadeTermoBruto);
  const norm = CITY_TYPO_ALIASES[normRaw] ?? normRaw;
  if (!norm) return resolveMunicipioIbgeFromText(cidadeTermoBruto) ?? null;

  const [exact] = await db<{ ibge_code: string }[]>`
    SELECT ibge_code FROM exeq_core.ibge_municipios
    WHERE nome_normalizado = ${norm}
    LIMIT 1
  `;
  if (exact?.ibge_code) return exact.ibge_code;

  const [prefix] = await db<{ ibge_code: string }[]>`
    SELECT ibge_code FROM exeq_core.ibge_municipios
    WHERE nome_normalizado LIKE ${`${norm}%`}
       OR nome_normalizado LIKE ${`%${norm}%`}
    ORDER BY length(nome_normalizado) ASC
    LIMIT 1
  `;
  if (prefix?.ibge_code) return prefix.ibge_code;

  const fuzzy = await resolveFuzzyFromDb(db, norm);
  if (fuzzy) return fuzzy;

  return resolveMunicipioIbgeFromText(cidadeTermoBruto) ?? null;
}
