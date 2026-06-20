import { z } from "zod";
import { taxRegimeSchema } from "./fiscal.js";

/** Header row for catalog CSV import (matches validated pilot template). */
export const CATALOG_CSV_HEADERS = [
  "catalog_version",
  "fiscal_profile_name",
  "ibge_code",
  "municipio_nome",
  "uf",
  "service_code",
  "service_description",
  "tax_regime",
  "iss_rate",
  "iss_retained",
  "irrf_rate",
  "pis_rate",
  "cofins_rate",
  "csll_rate",
  "simples_codigo_tributacao",
  "valid_from",
  "valid_to",
  "priority",
  "observacao_contador",
] as const;

export type CatalogCsvRow = {
  fiscal_profile_name: string;
  ibge_code: string;
  municipio_nome: string;
  uf: string;
  service_code: string;
  service_description: string;
  tax_regime: z.infer<typeof taxRegimeSchema>;
  iss_rate: number;
  iss_retained: boolean;
  irrf_rate: number;
  pis_rate: number;
  cofins_rate: number;
  csll_rate: number;
  simples_codigo_tributacao?: number;
  valid_from: string;
  valid_to?: string;
  priority: number;
  observacao_contador?: string;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function toBool(value: string): boolean {
  return value.toLowerCase() === "true" || value === "1";
}

function toNum(value: string, fallback = 0): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return Number(trimmed);
}

function toOptionalNum(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "PENDENTE_VALIDACAO") return undefined;
  return Number(trimmed);
}

export type ParseCatalogCsvResult = {
  rows: CatalogCsvRow[];
  errors: { line: number; message: string }[];
};

/**
 * Parses catalog municipal CSV (UTF-8). Pure function — unit tested.
 */
export function parseCatalogCsv(content: string): ParseCatalogCsvResult {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: [{ line: 1, message: "CSV vazio ou sem dados" }] };
  }

  const header = parseCsvLine(lines[0]!);
  const headerIndex = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  const required = [
    "fiscal_profile_name",
    "ibge_code",
    "municipio_nome",
    "uf",
    "service_code",
    "service_description",
    "tax_regime",
    "iss_rate",
    "iss_retained",
    "valid_from",
  ];
  for (const col of required) {
    if (!(col in headerIndex)) {
      return { rows: [], errors: [{ line: 1, message: `Coluna obrigatoria ausente: ${col}` }] };
    }
  }

  const rows: CatalogCsvRow[] = [];
  const errors: ParseCatalogCsvResult["errors"] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const fields = parseCsvLine(lines[i]!);
    const get = (col: string) => fields[headerIndex[col]!] ?? "";

    try {
      const taxRegime = taxRegimeSchema.parse(get("tax_regime"));
      const issRate = toNum(get("iss_rate"));
      const row: CatalogCsvRow = {
        fiscal_profile_name: get("fiscal_profile_name").trim(),
        ibge_code: get("ibge_code").trim(),
        municipio_nome: get("municipio_nome").trim(),
        uf: get("uf").trim(),
        service_code: get("service_code").trim(),
        service_description: get("service_description").trim(),
        tax_regime: taxRegime,
        iss_rate: issRate,
        iss_retained: toBool(get("iss_retained")),
        irrf_rate: toNum(get("irrf_rate")),
        pis_rate: toNum(get("pis_rate")),
        cofins_rate: toNum(get("cofins_rate")),
        csll_rate: toNum(get("csll_rate")),
        simples_codigo_tributacao: toOptionalNum(get("simples_codigo_tributacao")),
        valid_from: get("valid_from").trim(),
        valid_to: get("valid_to").trim() || undefined,
        priority: toNum(get("priority"), 100),
        observacao_contador: get("observacao_contador").trim() || undefined,
      };

      if (row.tax_regime === "simples_nacional" && row.simples_codigo_tributacao == null) {
        errors.push({ line: lineNo, message: "simples_codigo_tributacao obrigatorio" });
        continue;
      }
      if (!/^\d{7}$/.test(row.ibge_code)) {
        errors.push({ line: lineNo, message: "ibge_code invalido" });
        continue;
      }

      rows.push(row);
    } catch {
      errors.push({ line: lineNo, message: "Linha invalida" });
    }
  }

  return { rows, errors };
}
