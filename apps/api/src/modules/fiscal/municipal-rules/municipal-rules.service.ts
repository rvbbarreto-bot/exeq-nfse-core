import {
  DEFAULT_MUNICIPAL_EMISSION_RULES,
  type MunicipalEmissionRules,
  type MunicipalEmissionRulesDto,
  type UpsertMunicipalEmissionRulesInput,
} from "@exeq/shared";
import type { Sql } from "../../../db/client.js";
import {
  toMunicipalRulesDto,
  type MunicipalRulesRepository,
} from "./municipal-emission-rules.entity.js";
import { SqlMunicipalRulesRepository } from "./municipal-rules.sql-repository.js";

export class MunicipalRulesService {
  constructor(private readonly repository: MunicipalRulesRepository) {}

  async resolveByIbge(ibgeCode: string): Promise<MunicipalEmissionRules> {
    const rules = await this.repository.findByIbge(ibgeCode);
    if (rules) return rules;
    return {
      ibge_code: ibgeCode,
      municipio_nome: "Desconhecido",
      uf: "XX",
      enviar_inscricao_municipal_prestador:
        DEFAULT_MUNICIPAL_EMISSION_RULES.enviar_inscricao_municipal_prestador,
      usa_nfse_nacional: true,
      provider_kind: "focus_nacional",
    };
  }

  async resolveDtoByIbge(ibgeCode: string): Promise<MunicipalEmissionRulesDto> {
    const rules = await this.resolveByIbge(ibgeCode);
    return toMunicipalRulesDto(rules);
  }

  async listAll(): Promise<MunicipalEmissionRules[]> {
    return this.repository.listAll();
  }

  async upsert(
    ibgeCode: string,
    input: UpsertMunicipalEmissionRulesInput,
  ): Promise<MunicipalEmissionRules> {
    return this.repository.upsert(ibgeCode, input);
  }
}

export function createMunicipalRulesService(db: Sql): MunicipalRulesService {
  return new MunicipalRulesService(new SqlMunicipalRulesRepository(db));
}
