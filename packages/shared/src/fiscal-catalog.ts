import { z } from "zod";
import { taxRegimeSchema } from "./fiscal.js";

export const catalogStatusSchema = z.enum(["draft", "published", "superseded"]);

export type CatalogStatus = z.infer<typeof catalogStatusSchema>;

export const createFiscalProfileSchema = z.object({
  name: z.string().min(2).max(120),
  tax_regime: taxRegimeSchema,
  iss_retention_policy: z.enum(["none", "always", "by_rule"]).default("by_rule"),
});

export type CreateFiscalProfileInput = z.infer<typeof createFiscalProfileSchema>;

export const updateFiscalProfileSchema = createFiscalProfileSchema.partial().extend({
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export type UpdateFiscalProfileInput = z.infer<typeof updateFiscalProfileSchema>;

const municipalTaxRuleBaseSchema = z.object({
  fiscal_profile_id: z.string().uuid(),
  ibge_code: z.string().length(7).regex(/^\d{7}$/),
  municipio_nome: z.string().min(2).max(120),
  uf: z.string().length(2),
  service_code: z.string().min(1).max(32),
  service_description: z.string().min(2).max(500),
  tax_regime: taxRegimeSchema,
  iss_rate: z.number().min(0).max(1),
  iss_retained: z.boolean(),
  irrf_rate: z.number().min(0).max(1).default(0),
  pis_rate: z.number().min(0).max(1).default(0),
  cofins_rate: z.number().min(0).max(1).default(0),
  csll_rate: z.number().min(0).max(1).default(0),
  simples_codigo_tributacao: z.number().int().min(1).max(3).optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.number().int().min(1).max(9999).default(100),
  observacao_contador: z.string().max(4000).optional(),
});

export const createMunicipalTaxRuleSchema = municipalTaxRuleBaseSchema.superRefine((data, ctx) => {
    if (data.tax_regime === "simples_nacional" && data.simples_codigo_tributacao == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "simples_codigo_tributacao obrigatorio para Simples Nacional",
        path: ["simples_codigo_tributacao"],
      });
    }
    if (data.valid_to && data.valid_to < data.valid_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "valid_to deve ser >= valid_from",
        path: ["valid_to"],
      });
    }
  });

export type CreateMunicipalTaxRuleInput = z.infer<typeof createMunicipalTaxRuleSchema>;

export const updateMunicipalTaxRuleSchema = municipalTaxRuleBaseSchema.partial();

export type UpdateMunicipalTaxRuleInput = z.infer<typeof updateMunicipalTaxRuleSchema>;
