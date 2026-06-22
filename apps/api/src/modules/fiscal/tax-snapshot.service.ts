import type { TaxResolveResponse } from "@exeq/shared";

import type { Sql } from "../../db/client.js";

import { sha256Hex } from "../../lib/hash.js";

import { asJsonValue } from "../../lib/json.js";

import { emitTaxSnapshotCreated } from "../../observability/fiscal-telemetry.js";

import {

  computeFiscalTaxes,

  fiscalEngineResultToSnapshotTaxes,

  buildSplitPaymentFromEngine,

} from "./fiscal-engine.adapter.js";



export type CreateTaxSnapshotInput = {

  tenantId: string;

  nfIssueId: string;

  tax: TaxResolveResponse;

  amountCents: number;

  payloadHash: string;

  competenceDate: string;

  municipioDestinoIbge: string;

  municipioOrigemIbge?: string;

};



export type TaxSnapshotRow = {

  id: string;

  engine: string;

  payload_hash: string;

  created_at: string;

};



async function getPublishedCatalogId(db: Sql, tenantId: string): Promise<string | null> {

  const [row] = await db<{ id: string }[]>`

    SELECT id FROM exeq_core.tax_rule_catalogs

    WHERE tenant_id = ${tenantId}::uuid AND status = 'published'

    ORDER BY version DESC

    LIMIT 1

  `;

  return row?.id ?? null;

}



export async function createTaxSnapshot(

  db: Sql,

  input: CreateTaxSnapshotInput,

): Promise<TaxSnapshotRow> {

  const catalogId = await getPublishedCatalogId(db, input.tenantId);



  const fiscalResult = await computeFiscalTaxes(db, {

    tenantId: input.tenantId,

    amount_cents: input.amountCents,

    competence_date: input.competenceDate,

    ibge_code: input.municipioDestinoIbge,

    service_code: input.tax.service_code,

    tax: input.tax,

  });



  const engine = fiscalResult.engine;

  const legislationCode = fiscalResult.legislation_code;

  const resolvedTaxes = fiscalEngineResultToSnapshotTaxes(fiscalResult, input.tax);

  const futureTaxes = fiscalResult.future_taxes;

  const splitPayment = buildSplitPaymentFromEngine(fiscalResult, input.municipioDestinoIbge);



  const canonical = JSON.stringify({

    engine,

    legislation_code: legislationCode,

    resolved_taxes: resolvedTaxes,

    payload_hash: input.payloadHash,

  });

  const snapshotHash = sha256Hex(canonical);



  const [row] = await db<TaxSnapshotRow[]>`

    INSERT INTO exeq_fiscal.tax_snapshot (

      tenant_id,

      nf_issue_id,

      catalog_id,

      catalog_version,

      legislation_code,

      engine,

      municipio_origem_ibge,

      municipio_destino_ibge,

      resolved_taxes,

      future_taxes,

      payload_hash,

      split_payment

    ) VALUES (

      ${input.tenantId}::uuid,

      ${input.nfIssueId}::uuid,

      ${catalogId}::uuid,

      ${input.tax.catalog_version},

      ${legislationCode},

      ${engine},

      ${input.municipioOrigemIbge ?? input.municipioDestinoIbge},

      ${input.municipioDestinoIbge},

      ${db.json(asJsonValue(resolvedTaxes))},

      ${db.json(asJsonValue(futureTaxes))},

      ${snapshotHash},

      ${db.json(asJsonValue(splitPayment))}

    )

    RETURNING id, engine, payload_hash, created_at::text AS created_at

  `;



  emitTaxSnapshotCreated({

    tenant_id: input.tenantId,

    tax_snapshot_id: row!.id,

    nf_issue_id: input.nfIssueId,

    engine,

    payload_hash: snapshotHash,

  });



  return row!;

}



export async function getTaxSnapshotByIssueId(

  db: Sql,

  tenantId: string,

  nfIssueId: string,

): Promise<TaxSnapshotRow | null> {

  const [row] = await db<TaxSnapshotRow[]>`

    SELECT id, engine, payload_hash, created_at::text AS created_at

    FROM exeq_fiscal.tax_snapshot

    WHERE tenant_id = ${tenantId}::uuid AND nf_issue_id = ${nfIssueId}::uuid

    LIMIT 1

  `;

  return row ?? null;

}


