import type { MunicipalEmissionRules, UpsertMunicipalEmissionRulesInput } from "@exeq/shared";
import { municipalEmissionRulesSchema } from "@exeq/shared";
import type { Sql } from "../../../db/client.js";
import type { MunicipalRulesRepository } from "./municipal-emission-rules.entity.js";

type Row = {
  ibge_code: string;
  municipio_nome: string;
  uf: string;
  enviar_inscricao_municipal_prestador: boolean;
  usa_nfse_nacional: boolean;
  provider_kind: string;
  payload_flags: unknown;
  observacao: string | null;
};

function mapRow(row: Row): MunicipalEmissionRules {
  return municipalEmissionRulesSchema.parse({
    ibge_code: row.ibge_code,
    municipio_nome: row.municipio_nome,
    uf: row.uf,
    enviar_inscricao_municipal_prestador: row.enviar_inscricao_municipal_prestador,
    usa_nfse_nacional: row.usa_nfse_nacional,
    provider_kind: row.provider_kind,
    payload_flags: row.payload_flags ?? {},
    observacao: row.observacao,
  });
}

export class SqlMunicipalRulesRepository implements MunicipalRulesRepository {
  constructor(private readonly db: Sql) {}

  async findByIbge(ibgeCode: string): Promise<MunicipalEmissionRules | null> {
    const [row] = await this.db<Row[]>`
      SELECT
        ibge_code,
        municipio_nome,
        uf,
        enviar_inscricao_municipal_prestador,
        usa_nfse_nacional,
        provider_kind::text AS provider_kind,
        payload_flags,
        observacao
      FROM exeq_core.municipal_emission_rules
      WHERE ibge_code = ${ibgeCode}
      LIMIT 1
    `;
    if (!row) return null;
    return mapRow(row);
  }

  async listAll(): Promise<MunicipalEmissionRules[]> {
    const rows = await this.db<Row[]>`
      SELECT
        ibge_code,
        municipio_nome,
        uf,
        enviar_inscricao_municipal_prestador,
        usa_nfse_nacional,
        provider_kind::text AS provider_kind,
        payload_flags,
        observacao
      FROM exeq_core.municipal_emission_rules
      ORDER BY ibge_code
    `;
    return rows.map(mapRow);
  }

  async upsert(
    ibgeCode: string,
    input: UpsertMunicipalEmissionRulesInput,
  ): Promise<MunicipalEmissionRules> {
    const payloadFlags = JSON.stringify(input.payload_flags ?? {});
    const [row] = await this.db<Row[]>`
      INSERT INTO exeq_core.municipal_emission_rules (
        ibge_code, municipio_nome, uf,
        enviar_inscricao_municipal_prestador, usa_nfse_nacional, provider_kind,
        payload_flags, observacao
      ) VALUES (
        ${ibgeCode},
        ${input.municipio_nome},
        ${input.uf},
        ${input.enviar_inscricao_municipal_prestador},
        ${input.usa_nfse_nacional},
        ${input.provider_kind}::exeq_core.nfse_provider_kind,
        ${payloadFlags}::jsonb,
        ${input.observacao ?? null}
      )
      ON CONFLICT (ibge_code) DO UPDATE SET
        municipio_nome = EXCLUDED.municipio_nome,
        uf = EXCLUDED.uf,
        enviar_inscricao_municipal_prestador = EXCLUDED.enviar_inscricao_municipal_prestador,
        usa_nfse_nacional = EXCLUDED.usa_nfse_nacional,
        provider_kind = EXCLUDED.provider_kind,
        payload_flags = EXCLUDED.payload_flags,
        observacao = EXCLUDED.observacao,
        updated_at = now()
      RETURNING
        ibge_code,
        municipio_nome,
        uf,
        enviar_inscricao_municipal_prestador,
        usa_nfse_nacional,
        provider_kind::text AS provider_kind,
        payload_flags,
        observacao
    `;

    await this.db`
      INSERT INTO exeq_core.municipal_nfse_routing (ibge_code, provider_kind, wsdl_url, notes)
      VALUES (
        ${ibgeCode},
        ${input.provider_kind}::exeq_core.nfse_provider_kind,
        NULL,
        ${input.observacao ?? `Sincronizado via municipal_emission_rules (${input.municipio_nome})`}
      )
      ON CONFLICT (ibge_code) DO UPDATE SET
        provider_kind = EXCLUDED.provider_kind,
        notes = EXCLUDED.notes,
        updated_at = now()
    `;

    return mapRow(row);
  }
}
