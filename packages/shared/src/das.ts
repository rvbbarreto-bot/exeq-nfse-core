import { z } from "zod";

export const competenciaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competencia deve estar no formato YYYY-MM");

export const guiaFiscalStatusSchema = z.enum([
  "PROCESSANDO",
  "DISPONIVEL",
  "PAGO",
  "CANCELADO",
  "RETIFICADO",
  "VENCIDO",
  "EM_CONTESTACAO",
]);

export const tipoGuiaSchema = z.enum(["DAS", "DARF"]);

export const complianceStatusSchema = z.enum([
  "pendente",
  "aprovado",
  "bloqueado",
  "dispensado",
]);

export const guiaFiscalResponseSchema = z.object({
  id: z.string().uuid(),
  provider_id: z.string().uuid(),
  tipo_guia: tipoGuiaSchema,
  competencia: competenciaSchema,
  data_vencimento: z.string().date().nullable(),
  valor_principal: z.number(),
  valor_multa: z.number(),
  valor_juros: z.number(),
  valor_total: z.number(),
  linha_digitavel: z.string().nullable(),
  pix_copia_cola: z.string().nullable(),
  status: guiaFiscalStatusSchema,
  compliance_status: complianceStatusSchema,
  compliance_motivo: z.string().nullable(),
  pdf_storage_key: z.string().nullable(),
  versao_atual: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type GuiaFiscalResponse = z.infer<typeof guiaFiscalResponseSchema>;

export const listDasGuiasQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
  status: guiaFiscalStatusSchema.optional(),
  tipo_guia: tipoGuiaSchema.optional(),
  provider_id: z.string().uuid().optional(),
  competencia: competenciaSchema.optional(),
});

export type ListDasGuiasQuery = z.infer<typeof listDasGuiasQuerySchema>;

export const emitDasGuiaSchema = z
  .object({
    provider_id: z.string().uuid(),
    tipo_guia: tipoGuiaSchema.default("DAS"),
    competencia: competenciaSchema,
    idempotency_key: z.string().min(8).max(200).optional(),
    codigo_receita: z.string().min(1).max(10).optional(),
    periodo_apuracao: z.string().date().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.tipo_guia === "DARF") {
      if (!body.codigo_receita) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "codigo_receita obrigatorio para DARF",
          path: ["codigo_receita"],
        });
      }
      if (!body.periodo_apuracao) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "periodo_apuracao obrigatorio para DARF",
          path: ["periodo_apuracao"],
        });
      }
    }
  });

export type EmitDasGuiaInput = z.infer<typeof emitDasGuiaSchema>;
