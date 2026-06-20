import type {
  MunicipalEmissionRules,
  MunicipalEmissionRulesDto,
  UpsertMunicipalEmissionRulesInput,
} from "@exeq/shared";

export type { MunicipalEmissionRules };

/** Port — regras de emissão por município (hexagonal). */
export interface MunicipalRulesRepository {
  findByIbge(ibgeCode: string): Promise<MunicipalEmissionRules | null>;
  listAll(): Promise<MunicipalEmissionRules[]>;
  upsert(ibgeCode: string, input: UpsertMunicipalEmissionRulesInput): Promise<MunicipalEmissionRules>;
}

export function toMunicipalRulesDto(rules: MunicipalEmissionRules): MunicipalEmissionRulesDto {
  return {
    enviar_inscricao_municipal_prestador: rules.enviar_inscricao_municipal_prestador,
    payload_flags: rules.payload_flags,
  };
}