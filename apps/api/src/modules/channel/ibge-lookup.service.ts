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

/** Busca IBGE no DB; fallback para pilot-municipios.ts (hardcoded). */
export async function resolveMunicipioIbgeFromDb(
  db: Sql,
  cidadeTermoBruto: string,
): Promise<string | null> {
  const norm = normalizeMunicipioSearchTerm(cidadeTermoBruto);
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

  return resolveMunicipioIbgeFromText(cidadeTermoBruto) ?? null;
}
