import { z } from "zod";
import { nfseProviderKindSchema } from "./nfse-provider.js";

/** Endereço padrão quando cadastro do tomador não tem campos obrigatórios (homologação). */
export const municipalEnderecoFallbackSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  district: z.string().min(1),
  zip_code: z.string().min(8),
});

export type MunicipalEnderecoFallback = z.infer<typeof municipalEnderecoFallbackSchema>;

/**
 * Flags extensíveis por município — novas rejeições CNC viram chaves aqui,
 * sem alterar código dos builders.
 */
export const municipalPayloadFlagsSchema = z
  .object({
    endereco_tomador_fallback: municipalEnderecoFallbackSchema.optional(),
  })
  .passthrough();

export type MunicipalPayloadFlags = z.infer<typeof municipalPayloadFlagsSchema>;

/** Regras de emissão por município (CNC / ADN / provedor). */
export const municipalEmissionRulesSchema = z.object({
  ibge_code: z.string().length(7).regex(/^\d{7}$/),
  municipio_nome: z.string().min(2),
  uf: z.string().length(2),
  enviar_inscricao_municipal_prestador: z.boolean(),
  usa_nfse_nacional: z.boolean(),
  provider_kind: nfseProviderKindSchema,
  payload_flags: municipalPayloadFlagsSchema.optional(),
  observacao: z.string().nullable().optional(),
});

export type MunicipalEmissionRules = z.infer<typeof municipalEmissionRulesSchema>;

/** Subconjunto embutido no DTO exeq.nfse.v1 para builders. */
export const municipalEmissionRulesDtoSchema = municipalEmissionRulesSchema.pick({
  enviar_inscricao_municipal_prestador: true,
  payload_flags: true,
});

export type MunicipalEmissionRulesDto = z.infer<typeof municipalEmissionRulesDtoSchema>;

export const DEFAULT_MUNICIPAL_EMISSION_RULES: MunicipalEmissionRulesDto = {
  enviar_inscricao_municipal_prestador: true,
};

export const upsertMunicipalEmissionRulesSchema = municipalEmissionRulesSchema.omit({
  ibge_code: true,
});

export type UpsertMunicipalEmissionRulesInput = z.infer<typeof upsertMunicipalEmissionRulesSchema>;
