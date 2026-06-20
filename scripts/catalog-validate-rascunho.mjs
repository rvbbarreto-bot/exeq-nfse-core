#!/usr/bin/env node
/**
 * Valida CSVs rascunho (Issue #16) — parse sem importar em homolog.
 * Uso: npm run catalog:validate-rascunho
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalogCsv } from "@exeq/shared";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rascunhoDir = path.resolve(root, "../docs/templates/rascunho");

async function main() {
  console.log("=== Validação CSV rascunho (US-FIS-00) ===\n");
  let files;
  try {
    files = (await readdir(rascunhoDir)).filter((f) => f.endsWith(".csv"));
  } catch {
    console.error(`FALHA: pasta não encontrada: ${rascunhoDir}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("FALHA: nenhum CSV em rascunho/");
    process.exit(1);
  }

  let failed = false;
  for (const file of files.sort()) {
    const full = path.join(rascunhoDir, file);
    const content = await readFile(full, "utf-8");
    const result = parseCatalogCsv(content);
    const rowOk = result.rows.length >= 6;
    const parseOk = result.errors.length === 0;
    const ok = rowOk && parseOk;
    const warn = rowOk && !parseOk;
    console.log(
      `${ok ? "OK" : warn ? "WARN" : "FALHA"}  ${file} — ${result.rows.length} linhas, ${result.errors.length} erros`,
    );
    if (!rowOk) failed = true;
    if (!parseOk) {
      for (const err of result.errors.slice(0, 5)) {
        console.log(`      linha ${err.line}: ${err.message}`);
      }
      if (warn) {
        console.log("      (esperado em RASCUNHO com PENDENTE_VALIDACAO — revisar contador)");
      }
    }
  }

  if (failed) process.exit(1);
  console.log("\nCatálogo rascunho: válido para revisão contador (não importa em homolog).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
