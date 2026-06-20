import type { MunicipalEmissionRulesDto } from "@exeq/shared";
import {
  ATIBAIA_MUNICIPAL_RULES,
  GENERIC_MUNICIPAL_RULES,
} from "../../src/modules/fiscal/municipal-rules/municipal-rules.in-memory.repository.js";

/** Regras municipais para testes adapter/P0 (espelha seed migration 0013/0014). */
export function municipalRulesFixtureForIbge(ibgeCode: string): MunicipalEmissionRulesDto | undefined {
  if (ibgeCode === ATIBAIA_MUNICIPAL_RULES.ibge_code) {
    return {
      enviar_inscricao_municipal_prestador: false,
      payload_flags: ATIBAIA_MUNICIPAL_RULES.payload_flags,
    };
  }
  if (ibgeCode === GENERIC_MUNICIPAL_RULES.ibge_code) {
    return { enviar_inscricao_municipal_prestador: true };
  }
  return { enviar_inscricao_municipal_prestador: true };
}
