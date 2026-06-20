import type { CatalogCsvRow } from "@exeq/shared";
import type { CreateMunicipalTaxRuleInput } from "@exeq/shared";

export type FiscalProfileLookup = { id: string; name: string };

export type MapCsvRowsResult = {
  rules: CreateMunicipalTaxRuleInput[];
  errors: { line: number; message: string }[];
};

/**
 * Maps parsed CSV rows to API rule inputs, resolving fiscal profile by name.
 */
export function mapCsvRowsToRules(
  rows: CatalogCsvRow[],
  profiles: FiscalProfileLookup[],
  lineOffset = 2,
): MapCsvRowsResult {
  const byName = new Map(profiles.map((p) => [p.name.toLowerCase(), p.id]));
  const rules: CreateMunicipalTaxRuleInput[] = [];
  const errors: MapCsvRowsResult["errors"] = [];

  rows.forEach((row, index) => {
    const line = index + lineOffset;
    const profileId = byName.get(row.fiscal_profile_name.toLowerCase());
    if (!profileId) {
      errors.push({
        line,
        message: `Perfil fiscal nao encontrado: ${row.fiscal_profile_name}`,
      });
      return;
    }

    rules.push({
      fiscal_profile_id: profileId,
      ibge_code: row.ibge_code,
      municipio_nome: row.municipio_nome,
      uf: row.uf,
      service_code: row.service_code,
      service_description: row.service_description,
      tax_regime: row.tax_regime,
      iss_rate: row.iss_rate,
      iss_retained: row.iss_retained,
      irrf_rate: row.irrf_rate,
      pis_rate: row.pis_rate,
      cofins_rate: row.cofins_rate,
      csll_rate: row.csll_rate,
      simples_codigo_tributacao: row.simples_codigo_tributacao,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      priority: row.priority,
      observacao_contador: row.observacao_contador,
    });
  });

  return { rules, errors };
}
