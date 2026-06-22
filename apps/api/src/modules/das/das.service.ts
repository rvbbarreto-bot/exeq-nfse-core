import { randomUUID } from "node:crypto";
import type { EmitDasGuiaInput, GuiaFiscalResponse, ListDasGuiasQuery } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { captureDasReceita, captureDarfReceita } from "./receita-gateway.service.js";

type GuiaRow = {
  id: string;
  provider_id: string;
  tipo_guia: "DAS" | "DARF";
  competencia: string;
  data_vencimento: string | null;
  valor_principal: string;
  valor_multa: string;
  valor_juros: string;
  valor_total: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  status: GuiaFiscalResponse["status"];
  compliance_status: GuiaFiscalResponse["compliance_status"];
  compliance_motivo: string | null;
  pdf_storage_key: string | null;
  versao_atual: number;
  created_at: Date;
  updated_at: Date;
};

export class DuplicateDasIdempotencyError extends Error {
  constructor(public readonly guiaId: string) {
    super("DUPLICATE_IDEMPOTENCY");
    this.name = "DuplicateDasIdempotencyError";
  }
}

export class DuplicateDasCompetenciaError extends Error {
  constructor(public readonly guiaId: string) {
    super("DUPLICATE_COMPETENCIA");
    this.name = "DuplicateDasCompetenciaError";
  }
}

export class ProviderNotFoundError extends Error {
  constructor() {
    super("PROVIDER_NOT_FOUND");
    this.name = "ProviderNotFoundError";
  }
}

export class GuiaNotFoundError extends Error {
  constructor() {
    super("GUIA_NOT_FOUND");
    this.name = "GuiaNotFoundError";
  }
}

function mapGuia(row: GuiaRow): GuiaFiscalResponse {
  return {
    id: row.id,
    provider_id: row.provider_id,
    tipo_guia: row.tipo_guia,
    competencia: row.competencia,
    data_vencimento: row.data_vencimento,
    valor_principal: Number(row.valor_principal),
    valor_multa: Number(row.valor_multa),
    valor_juros: Number(row.valor_juros),
    valor_total: Number(row.valor_total),
    linha_digitavel: row.linha_digitavel,
    pix_copia_cola: row.pix_copia_cola,
    status: row.status,
    compliance_status: row.compliance_status,
    compliance_motivo: row.compliance_motivo,
    pdf_storage_key: row.pdf_storage_key,
    versao_atual: row.versao_atual,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function getProviderCnpj(db: Sql, tenantId: string, providerId: string): Promise<string> {
  const [row] = await db<{ document: string }[]>`
    SELECT document FROM exeq_core.providers
    WHERE id = ${providerId}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  if (!row?.document) throw new ProviderNotFoundError();
  return row.document.replace(/\D/g, "");
}

export async function listDasGuias(
  db: Sql,
  tenantId: string,
  query: ListDasGuiasQuery,
): Promise<{ guias: GuiaFiscalResponse[]; next_cursor: string | null }> {
  const limit = query.limit;
  const rows = await db<GuiaRow[]>`
    SELECT
      id, provider_id, tipo_guia, competencia,
      data_vencimento::text AS data_vencimento,
      valor_principal::text, valor_multa::text, valor_juros::text, valor_total::text,
      linha_digitavel, pix_copia_cola, status, compliance_status, compliance_motivo,
      pdf_storage_key, versao_atual, created_at, updated_at
    FROM exeq_das.guia_fiscal
    WHERE tenant_id = ${tenantId}::uuid
      AND (${query.cursor ?? null}::uuid IS NULL OR id < ${query.cursor ?? null}::uuid)
      AND (${query.status ?? null}::text IS NULL OR status = ${query.status ?? null})
      AND (${query.tipo_guia ?? null}::text IS NULL OR tipo_guia = ${query.tipo_guia ?? null})
      AND (${query.provider_id ?? null}::uuid IS NULL OR provider_id = ${query.provider_id ?? null}::uuid)
      AND (${query.competencia ?? null}::text IS NULL OR competencia = ${query.competencia ?? null})
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    guias: page.map(mapGuia),
    next_cursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getDasGuia(
  db: Sql,
  tenantId: string,
  guiaId: string,
): Promise<GuiaFiscalResponse> {
  const [row] = await db<GuiaRow[]>`
    SELECT
      id, provider_id, tipo_guia, competencia,
      data_vencimento::text AS data_vencimento,
      valor_principal::text, valor_multa::text, valor_juros::text, valor_total::text,
      linha_digitavel, pix_copia_cola, status, compliance_status, compliance_motivo,
      pdf_storage_key, versao_atual, created_at, updated_at
    FROM exeq_das.guia_fiscal
    WHERE tenant_id = ${tenantId}::uuid AND id = ${guiaId}::uuid
    LIMIT 1
  `;
  if (!row) throw new GuiaNotFoundError();
  return mapGuia(row);
}

export async function emitDasGuia(
  db: Sql,
  tenantId: string,
  input: EmitDasGuiaInput,
): Promise<GuiaFiscalResponse> {
  const idempotencyKey = input.idempotency_key ?? randomUUID();
  const existing = await db<{ id: string }[]>`
    SELECT id FROM exeq_das.guia_fiscal
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    throw new DuplicateDasIdempotencyError(existing[0].id);
  }

  const [existingCompetencia] = await db<{ id: string }[]>`
    SELECT id FROM exeq_das.guia_fiscal
    WHERE tenant_id = ${tenantId}::uuid
      AND provider_id = ${input.provider_id}::uuid
      AND tipo_guia = ${input.tipo_guia}
      AND competencia = ${input.competencia}
      AND versao_atual = 1
    LIMIT 1
  `;
  if (existingCompetencia) {
    throw new DuplicateDasCompetenciaError(existingCompetencia.id);
  }

  const cnpj = await getProviderCnpj(db, tenantId, input.provider_id);
  const capture =
    input.tipo_guia === "DARF"
      ? await captureDarfReceita({
          cnpj,
          competencia: input.competencia,
          codigoReceita: input.codigo_receita!,
          periodoApuracao: input.periodo_apuracao!,
        })
      : await captureDasReceita({ cnpj, competencia: input.competencia });

  const pdfKey = `das/${tenantId}/${idempotencyKey}.pdf`;

  const [row] = await db<GuiaRow[]>`
    INSERT INTO exeq_das.guia_fiscal (
      tenant_id, provider_id, tipo_guia, competencia, data_vencimento,
      valor_principal, valor_multa, valor_juros, linha_digitavel, pix_copia_cola,
      status, compliance_status, pdf_storage_key, idempotency_key, metadata
    ) VALUES (
      ${tenantId}::uuid,
      ${input.provider_id}::uuid,
      ${input.tipo_guia},
      ${input.competencia},
      ${capture.dataVencimento}::date,
      ${capture.valorPrincipal},
      ${capture.valorMulta},
      ${capture.valorJuros},
      ${capture.linhaDigitavel},
      ${capture.pixCopiaCola},
      'DISPONIVEL',
      ${capture.complianceStatus},
      ${pdfKey},
      ${idempotencyKey},
      ${JSON.stringify({ pdf_size: capture.pdfBytes.length })}::jsonb
    )
    RETURNING
      id, provider_id, tipo_guia, competencia,
      data_vencimento::text AS data_vencimento,
      valor_principal::text, valor_multa::text, valor_juros::text, valor_total::text,
      linha_digitavel, pix_copia_cola, status, compliance_status, compliance_motivo,
      pdf_storage_key, versao_atual, created_at, updated_at
  `;

  return mapGuia(row!);
}
