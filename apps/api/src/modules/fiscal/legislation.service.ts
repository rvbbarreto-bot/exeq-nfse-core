import type { LegislationVersion, TransitionRates } from "@exeq/fiscal-engine";
import {
  getTransitionRatesForLegislation,
  resolveLegislationByDate,
  SANDBOX_LEGISLATION,
} from "@exeq/fiscal-engine";
import type { Sql } from "../../db/client.js";

export type DbLegislationRow = {
  code: string;
  title: string;
  valid_from: string;
  valid_to: string | null;
};

export type DbRateEntry = {
  tax_type: string;
  rate_percent: string;
};

export async function loadLegislationCatalog(db: Sql): Promise<LegislationVersion[]> {
  const rows = await db<DbLegislationRow[]>`
    SELECT code, title, valid_from::text AS valid_from, valid_to::text AS valid_to
    FROM exeq_fiscal.legislation_versions
    ORDER BY valid_from
  `;

  if (rows.length === 0) return SANDBOX_LEGISLATION;

  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
  }));
}

export async function resolveLegislationForCompetence(
  db: Sql,
  competenceDate: string,
): Promise<LegislationVersion> {
  const catalog = await loadLegislationCatalog(db);
  return resolveLegislationByDate(competenceDate, catalog);
}

/** rate_percent no DB é percentual (0.1 = 0.1%); engine usa decimal (0.001). */
function percentToDecimal(ratePercent: number): number {
  return ratePercent / 100;
}

export async function loadTransitionRates(
  db: Sql,
  legislationCode: string,
): Promise<TransitionRates> {
  const [leg] = await db<{ id: string }[]>`
    SELECT id FROM exeq_fiscal.legislation_versions WHERE code = ${legislationCode}
  `;

  if (!leg) {
    return getTransitionRatesForLegislation(legislationCode);
  }

  const entries = await db<DbRateEntry[]>`
    SELECT tax_type, rate_percent::text AS rate_percent
    FROM exeq_fiscal.tax_rate_entries
    WHERE legislation_version_id = ${leg.id}::uuid
  `;

  if (entries.length === 0) {
    return getTransitionRatesForLegislation(legislationCode);
  }

  const byType = new Map(entries.map((e) => [e.tax_type, parseFloat(e.rate_percent)]));

  return {
    ibs_rate: percentToDecimal(byType.get("ibs") ?? 0),
    cbs_rate: percentToDecimal(byType.get("cbs") ?? 0),
    iss_rate_multiplier: (byType.get("iss_multiplier") ?? 100) / 100,
  };
}

export async function countLegislationVersions(db: Sql): Promise<number> {
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM exeq_fiscal.legislation_versions
  `;
  return parseInt(row?.count ?? "0", 10);
}

export async function countTaxRateEntries(db: Sql): Promise<number> {
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM exeq_fiscal.tax_rate_entries
  `;
  return parseInt(row?.count ?? "0", 10);
}
