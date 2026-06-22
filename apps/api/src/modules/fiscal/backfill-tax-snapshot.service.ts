import type { TaxResolveResponse } from "@exeq/shared";
import { getMigrationDb, type Sql } from "../../db/client.js";
import { createTaxSnapshot } from "./tax-snapshot.service.js";
import { resolveTaxParams, TaxRuleNotFoundError } from "./tax-resolve.service.js";

export type BackfillOptions = {
  days?: number;
  tenantSlug?: string;
  tenantId?: string;
  limit?: number;
  dryRun?: boolean;
};

export type BackfillSummary = {
  tenant_id: string;
  tenant_slug?: string;
  days: number;
  candidates: number;
  created: number;
  skipped: number;
  errors: number;
  dry_run: boolean;
};

type CandidateRow = {
  id: string;
  tenant_id: string;
  ibge_code: string;
  competence_date: string;
  amount_cents: number;
  payload_hash: string | null;
  resolved_params: TaxResolveResponse | null;
  provider_tax_regime: string;
  service_code: string;
};

async function loadCandidates(
  db: Sql,
  tenantId: string,
  days: number,
  limit: number,
): Promise<CandidateRow[]> {
  return db<CandidateRow[]>`
    SELECT
      i.id,
      i.tenant_id,
      i.ibge_code,
      i.competence_date::text AS competence_date,
      i.amount_cents,
      i.payload_hash,
      i.resolved_params,
      p.tax_regime::text AS provider_tax_regime,
      s.service_code
    FROM exeq_core.nf_issue i
    INNER JOIN exeq_core.providers p ON p.id = i.provider_id
    INNER JOIN exeq_core.service_catalog_items s ON s.id = i.service_id
    LEFT JOIN exeq_fiscal.tax_snapshot ts ON ts.nf_issue_id = i.id
    WHERE i.tenant_id = ${tenantId}::uuid
      AND i.status = 'authorized'::exeq_core.nf_issue_status
      AND i.tax_snapshot_id IS NULL
      AND ts.id IS NULL
      AND i.created_at >= now() - (${days}::int || ' days')::interval
    ORDER BY i.created_at ASC
    LIMIT ${limit}
  `;
}

function resolveTaxFromIssue(row: CandidateRow): TaxResolveResponse | null {
  if (row.resolved_params && typeof row.resolved_params === "object") {
    return row.resolved_params as TaxResolveResponse;
  }
  return null;
}

async function resolveTenant(
  db: Sql,
  options: BackfillOptions,
): Promise<{ id: string; slug: string }> {
  if (options.tenantId) {
    const [tenant] = await db<{ id: string; slug: string }[]>`
      SELECT id, slug FROM exeq_core.tenants WHERE id = ${options.tenantId}::uuid LIMIT 1
    `;
    if (!tenant) {
      throw new Error(`TENANT_NOT_FOUND:${options.tenantId}`);
    }
    return tenant;
  }

  const tenantSlug = options.tenantSlug ?? "piloto-sp";
  const [tenant] = await db<{ id: string; slug: string }[]>`
    SELECT id, slug FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) {
    throw new Error(`TENANT_NOT_FOUND:${tenantSlug}`);
  }
  return tenant;
}

export async function runBackfillTaxSnapshots(
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const days = options.days ?? 90;
  const limit = options.limit ?? 5000;
  const dryRun = options.dryRun ?? false;

  const db = getMigrationDb();
  const tenant = await resolveTenant(db, options);

  const candidates = await loadCandidates(db, tenant.id, days, limit);
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of candidates) {
    try {
      let tax = resolveTaxFromIssue(row);
      if (!tax) {
        await db.begin(async (tx) => {
          await tx`SELECT set_config('app.tenant_id', ${row.tenant_id}, true)`;
          tax = await resolveTaxParams(tx, row.tenant_id, {
            ibge_code: row.ibge_code,
            service_code: row.service_code,
            tax_regime: row.provider_tax_regime as "simples_nacional",
            competence_date: row.competence_date,
          });
        });
      }

      const payloadHash = row.payload_hash ?? `backfill-${row.id}`;

      if (dryRun) {
        created += 1;
        continue;
      }

      const snapshot = await db.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${row.tenant_id}, true)`;
        const snap = await createTaxSnapshot(tx, {
          tenantId: row.tenant_id,
          nfIssueId: row.id,
          tax: tax!,
          amountCents: Number(row.amount_cents),
          payloadHash,
          competenceDate: row.competence_date,
          municipioDestinoIbge: row.ibge_code,
        });
        await tx`
          UPDATE exeq_core.nf_issue
          SET tax_snapshot_id = ${snap.id}::uuid
          WHERE id = ${row.id}::uuid AND tenant_id = ${row.tenant_id}::uuid
        `;
        return snap;
      });

      if (snapshot) created += 1;
    } catch (err) {
      if (err instanceof TaxRuleNotFoundError) {
        skipped += 1;
        continue;
      }
      errors += 1;
      console.error(`Erro issue ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    days,
    candidates: candidates.length,
    created,
    skipped,
    errors,
    dry_run: dryRun,
  };
}
