import { z } from "zod";

export const hybridTenantMigrationRequestSchema = z.object({
  competence_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

export type HybridTenantMigrationRequest = z.infer<typeof hybridTenantMigrationRequestSchema>;

export const HYBRID_MIGRATION_FLAGS = [
  "FEATURE_TRANSITION_MODE",
  "FEATURE_IBS",
  "FEATURE_CBS",
  "FEATURE_PREVIEW_TAX",
] as const;

export type TaxSettlementStatus = "registered" | "skipped" | "settled";

export const taxSettlementStatusSchema = z.enum(["registered", "skipped", "settled"]);

export const taxSettlementRowSchema = z.object({
  id: z.string().uuid(),
  nf_issue_id: z.string().uuid(),
  tax_snapshot_id: z.string().uuid().nullable(),
  competence_date: z.string(),
  engine: z.string(),
  split_payment: z.record(z.unknown()),
  status: taxSettlementStatusSchema,
  source_event: z.string(),
  created_at: z.string(),
});

export type TaxSettlementRow = z.infer<typeof taxSettlementRowSchema>;
