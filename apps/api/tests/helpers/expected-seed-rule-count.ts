import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogP0Schema } from "@exeq/shared";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/fiscal-p0",
);

/** Fixtures inseridos no catálogo publicado do seed piloto-sp (P0 + extensões). */
export const SEED_PUBLISHED_CATALOG_FIXTURES = [
  "catalog-p0-validado.json",
  "catalog-3505708-rascunho.json",
  "catalog-3547809-validado.json",
] as const;

let cached: number | null = null;

/** Total de regras no catálogo publicado após seed/restore (evita drift em testes). */
export async function expectedSeedPublishedRuleCount(): Promise<number> {
  if (cached != null) return cached;

  let total = 0;
  for (const file of SEED_PUBLISHED_CATALOG_FIXTURES) {
    const raw = JSON.parse(await readFile(path.join(fixtureDir, file), "utf-8"));
    total += catalogP0Schema.parse(raw).rules.length;
  }
  cached = total;
  return total;
}
