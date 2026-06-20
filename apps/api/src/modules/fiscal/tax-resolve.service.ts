import type { TaxRegime, TaxResolveRequest, TaxResolveResponse } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { mapRuleRowToResolved } from "./tax-resolve.mapper.js";

export class TaxRuleNotFoundError extends Error {
  constructor(
    public readonly details: {
      ibge_code: string;
      service_code: string;
      tax_regime: TaxRegime;
      competence_date: string;
    },
  ) {
    super("TAX_RULE_NOT_FOUND");
    this.name = "TaxRuleNotFoundError";
  }
}

type RuleRow = {
  id: string;
  catalog_version: number;
  ibge_code: string;
  service_code: string;
  tax_regime: TaxRegime;
  iss_rate: string;
  iss_retained: boolean;
  irrf_rate: string;
  pis_rate: string;
  cofins_rate: string;
  csll_rate: string;
  simples_codigo_tributacao: number | null;
  focus_field_overrides: Record<string, unknown> | null;
};

export async function resolveTaxParams(
  db: Sql,
  tenantId: string,
  input: TaxResolveRequest,
): Promise<TaxResolveResponse> {
  const profileName = input.fiscal_profile_name ?? "Perfil Piloto SP";

  const rows = await db<RuleRow[]>`
    SELECT
      r.id,
      c.version AS catalog_version,
      r.ibge_code,
      r.service_code,
      r.tax_regime,
      r.iss_rate::text,
      r.iss_retained,
      r.irrf_rate::text,
      r.pis_rate::text,
      r.cofins_rate::text,
      r.csll_rate::text,
      r.simples_codigo_tributacao,
      r.focus_field_overrides
    FROM exeq_core.municipal_tax_rules r
    INNER JOIN exeq_core.tax_rule_catalogs c ON c.id = r.catalog_id
    INNER JOIN exeq_core.fiscal_profiles fp ON fp.id = r.fiscal_profile_id
    WHERE r.tenant_id = ${tenantId}::uuid
      AND c.tenant_id = ${tenantId}::uuid
      AND c.status = 'published'
      AND fp.name = ${profileName}
      AND r.ibge_code = ${input.ibge_code}
      AND r.service_code = ${input.service_code}
      AND r.tax_regime = ${input.tax_regime}::exeq_core.tax_regime
      AND r.valid_from <= ${input.competence_date}::date
      AND (r.valid_to IS NULL OR r.valid_to >= ${input.competence_date}::date)
    ORDER BY r.priority ASC, r.valid_from DESC
    LIMIT 1
  `;

  const rule = rows[0];
  if (!rule) {
    throw new TaxRuleNotFoundError({
      ibge_code: input.ibge_code,
      service_code: input.service_code,
      tax_regime: input.tax_regime,
      competence_date: input.competence_date,
    });
  }

  const resolved = mapRuleRowToResolved(rule);
  const overrides =
    rule.focus_field_overrides && Object.keys(rule.focus_field_overrides).length > 0
      ? rule.focus_field_overrides
      : undefined;

  return {
    rule_id: rule.id,
    catalog_version: rule.catalog_version,
    ibge_code: rule.ibge_code,
    service_code: rule.service_code,
    tax_regime: rule.tax_regime,
    resolved,
    focus_field_overrides: overrides,
  };
}
