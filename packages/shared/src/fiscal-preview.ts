import { z } from "zod";
import { taxResolveResponseSchema } from "./fiscal.js";
import { emitNfseRequestSchema } from "./nf-issue.js";

/** Mesmos campos da emissão, sem idempotency (dry-run). */
export const fiscalPreviewRequestSchema = emitNfseRequestSchema.omit({
  idempotency_key: true,
});

export type FiscalPreviewRequest = z.infer<typeof fiscalPreviewRequestSchema>;

export const fiscalPreviewIssueSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export type FiscalPreviewIssue = z.infer<typeof fiscalPreviewIssueSchema>;

export const fiscalPreviewTaxBreakdownSchema = z.object({
  iss_rate: z.number(),
  iss_amount_cents: z.number().int(),
  iss_retained: z.boolean(),
  irrf_rate: z.number(),
  pis_rate: z.number(),
  cofins_rate: z.number(),
  csll_rate: z.number(),
  ibs: z
    .object({
      rate: z.number(),
      amount_cents: z.number().int(),
      note: z.string().optional(),
    })
    .optional(),
  cbs: z
    .object({
      rate: z.number(),
      amount_cents: z.number().int(),
      note: z.string().optional(),
    })
    .optional(),
});

export const fiscalPreviewResponseSchema = z.object({
  ready_to_emit: z.boolean(),
  engine: z.enum(["iss_legacy", "hybrid", "ibs_cbs_v1"]),
  nfse_provider_kind: z.string(),
  tax: taxResolveResponseSchema,
  tax_breakdown: fiscalPreviewTaxBreakdownSchema,
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(fiscalPreviewIssueSchema),
  }),
  provider_preview: z.object({
    provider_kind: z.string(),
    adapter_ok: z.boolean(),
    focus_payload_sample: z.record(z.unknown()).optional(),
    warnings: z.array(z.string()).optional(),
  }),
  operators: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      detail: z.string(),
      action: z.string(),
    }),
  ),
});

export type FiscalPreviewResponse = z.infer<typeof fiscalPreviewResponseSchema>;
