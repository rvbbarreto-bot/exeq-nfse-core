import { z } from "zod";
import { taxRegimeSchema } from "./fiscal.js";
import { addressSchema } from "./master-data.js";
import { municipalEmissionRulesDtoSchema } from "./municipal-emission-rules.js";

/** Canonical internal DTO — exeq.nfse.v1 */
export const exeqNfseV1Schema = z.object({
  schema_version: z.literal("exeq.nfse.v1"),
  prestador: z.object({
    cnpj: z.string().length(14),
    razao_social: z.string().min(2),
    inscricao_municipal: z.string().optional(),
    regime_tributario: taxRegimeSchema,
    endereco: addressSchema.optional(),
  }),
  tomador: z.object({
    documento: z.string().min(11).max(14),
    nome: z.string().min(2),
    email: z.string().email().optional(),
    endereco: addressSchema.optional(),
  }),
  servico: z.object({
    codigo: z.string().min(1),
    descricao: z.string().min(2),
    ibge_prestacao: z.string().length(7),
    valor_servico_cents: z.number().int().positive(),
    competencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  tributacao: z.object({
    iss_aliquota: z.number().min(0).max(1),
    iss_retido: z.boolean(),
    irrf_aliquota: z.number().min(0).max(1),
    pis_aliquota: z.number().min(0).max(1),
    cofins_aliquota: z.number().min(0).max(1),
    csll_aliquota: z.number().min(0).max(1),
    simples_codigo_tributacao: z.number().int().min(1).max(3).optional(),
    codigo_tributacao_nacional_iss: z.string().regex(/^\d{6}$/).optional(),
    focus_field_overrides: z.record(z.unknown()).optional(),
  }),
  /** Regras CNC/ADN do município emissor — alimentadas por MunicipalRulesService. */
  regras_municipais: municipalEmissionRulesDtoSchema.optional(),
  observacoes: z.string().max(2000).optional(),
});

export type ExeqNfseV1 = z.infer<typeof exeqNfseV1Schema>;
