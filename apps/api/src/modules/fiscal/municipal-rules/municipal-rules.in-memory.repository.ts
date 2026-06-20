import type {
  MunicipalEmissionRules,
  UpsertMunicipalEmissionRulesInput,
} from "@exeq/shared";
import type { MunicipalRulesRepository } from "./municipal-emission-rules.entity.js";

export class InMemoryMunicipalRulesRepository implements MunicipalRulesRepository {
  constructor(private readonly rules: Map<string, MunicipalEmissionRules> = new Map()) {}

  async findByIbge(ibgeCode: string): Promise<MunicipalEmissionRules | null> {
    return this.rules.get(ibgeCode) ?? null;
  }

  async listAll(): Promise<MunicipalEmissionRules[]> {
    return [...this.rules.values()].sort((a, b) => a.ibge_code.localeCompare(b.ibge_code));
  }

  async upsert(
    ibgeCode: string,
    input: UpsertMunicipalEmissionRulesInput,
  ): Promise<MunicipalEmissionRules> {
    const row: MunicipalEmissionRules = { ibge_code: ibgeCode, ...input };
    this.rules.set(ibgeCode, row);
    return row;
  }
}

export const ATIBAIA_MUNICIPAL_RULES: MunicipalEmissionRules = {
  ibge_code: "3504107",
  municipio_nome: "Atibaia",
  uf: "SP",
  enviar_inscricao_municipal_prestador: false,
  usa_nfse_nacional: true,
  provider_kind: "focus_nacional",
  payload_flags: {
    endereco_tomador_fallback: {
      street: "Rua Dona Sinha",
      number: "100",
      district: "Centro",
      zip_code: "12940000",
    },
  },
  observacao: "CNC NFS-e: não informar inscricao_municipal_prestador (E0120).",
};

export const GENERIC_MUNICIPAL_RULES: MunicipalEmissionRules = {
  ibge_code: "3507605",
  municipio_nome: "Bragança Paulista",
  uf: "SP",
  enviar_inscricao_municipal_prestador: true,
  usa_nfse_nacional: true,
  provider_kind: "focus_nacional",
};
