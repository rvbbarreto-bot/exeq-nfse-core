import { z } from "zod";

export const taxRegimeSchema = z.enum([
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
]);

export type TaxRegime = z.infer<typeof taxRegimeSchema>;

export const taxResolveRequestSchema = z.object({
  ibge_code: z.string().length(7).regex(/^\d{7}$/),
  service_code: z.string().min(1).max(32),
  tax_regime: taxRegimeSchema,
  competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fiscal_profile_name: z.string().min(1).optional(),
});

export type TaxResolveRequest = z.infer<typeof taxResolveRequestSchema>;

export const resolvedTaxParamsSchema = z.object({
  iss_rate: z.number(),
  iss_retained: z.boolean(),
  irrf_rate: z.number(),
  pis_rate: z.number(),
  cofins_rate: z.number(),
  csll_rate: z.number(),
  simples_codigo_tributacao: z.number().int().min(1).max(3).optional(),
});

export type ResolvedTaxParams = z.infer<typeof resolvedTaxParamsSchema>;

export const taxResolveResponseSchema = z.object({
  rule_id: z.string().uuid(),
  catalog_version: z.number().int(),
  ibge_code: z.string(),
  service_code: z.string(),
  tax_regime: taxRegimeSchema,
  resolved: resolvedTaxParamsSchema,
  focus_field_overrides: z.record(z.unknown()).optional(),
});

export type TaxResolveResponse = z.infer<typeof taxResolveResponseSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const fiscalP0FixtureSchema = z.object({
  schema: z.literal("exeq.fiscal_p0_fixture.v1"),
  catalog_source: z.string(),
  input: z.object({
    fiscal_profile_name: z.string(),
    ibge_code: z.string(),
    municipio_nome: z.string(),
    uf: z.string(),
    service_code: z.string(),
    service_description: z.string(),
    tax_regime: taxRegimeSchema,
    competence_date: z.string(),
  }),
  expected: resolvedTaxParamsSchema,
  metadata: z.object({
    status_validacao: z.string(),
    observacao_contador: z.string(),
    priority: z.number(),
  }),
});

export type FiscalP0Fixture = z.infer<typeof fiscalP0FixtureSchema>;

export const catalogP0Schema = z.object({
  version: z.number(),
  validated_at: z.string(),
  rules: z.array(fiscalP0FixtureSchema),
});

export type CatalogP0 = z.infer<typeof catalogP0Schema>;
