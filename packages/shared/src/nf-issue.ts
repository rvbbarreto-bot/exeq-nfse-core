import { z } from "zod";

export const nfIssueStatusSchema = z.enum([
  "draft",
  "pending_tax",
  "queued",
  "submitting",
  "polling",
  "authorized",
  "rejected",
  "cancelled",
  "failed",
]);

export type NfIssueStatus = z.infer<typeof nfIssueStatusSchema>;

const TRANSITIONS: Record<NfIssueStatus, NfIssueStatus[]> = {
  draft: ["pending_tax", "failed"],
  pending_tax: ["queued", "rejected", "failed"],
  queued: ["submitting", "failed"],
  submitting: ["polling", "rejected", "failed"],
  polling: ["authorized", "rejected", "failed"],
  authorized: ["cancelled"],
  rejected: [],
  cancelled: [],
  failed: ["queued"],
};

export class InvalidNfIssueTransitionError extends Error {
  constructor(
    readonly from: NfIssueStatus,
    readonly to: NfIssueStatus,
  ) {
    super(`INVALID_NF_ISSUE_TRANSITION:${from}->${to}`);
    this.name = "InvalidNfIssueTransitionError";
  }
}

export function canTransitionNfIssue(from: NfIssueStatus, to: NfIssueStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertNfIssueTransition(from: NfIssueStatus, to: NfIssueStatus): void {
  if (!canTransitionNfIssue(from, to)) {
    throw new InvalidNfIssueTransitionError(from, to);
  }
}

export function isTerminalNfIssueStatus(status: NfIssueStatus): boolean {
  return ["authorized", "rejected", "cancelled", "failed"].includes(status);
}

export const emitNfseRequestSchema = z.object({
  idempotency_key: z.string().min(8).max(128),
  provider_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  service_id: z.string().uuid(),
  ibge_code: z.string().length(7).regex(/^\d{7}$/),
  competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.number().int().positive(),
  fiscal_profile_name: z.string().min(2).max(120).optional(),
  description: z.string().min(2).max(2000).optional(),
});

export type EmitNfseRequest = z.infer<typeof emitNfseRequestSchema>;

export const emitNfseResponseSchema = z.object({
  issue_id: z.string().uuid(),
  status: nfIssueStatusSchema,
  correlation_id: z.string().uuid(),
});

export type EmitNfseResponse = z.infer<typeof emitNfseResponseSchema>;

export const nfIssueDetailSchema = z.object({
  id: z.string().uuid(),
  status: nfIssueStatusSchema,
  idempotency_key: z.string(),
  provider_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  service_id: z.string().uuid(),
  competence_date: z.string(),
  amount_cents: z.number(),
  resolved_rule_id: z.string().uuid().nullable(),
  focus_ref: z.string().nullable(),
  correlation_id: z.string().uuid(),
  created_at: z.string(),
  events: z.array(
    z.object({
      id: z.number(),
      from_status: nfIssueStatusSchema.nullable(),
      to_status: nfIssueStatusSchema,
      actor: z.string(),
      metadata: z.record(z.unknown()).nullable(),
      occurred_at: z.string(),
    }),
  ),
});

export type NfIssueDetail = z.infer<typeof nfIssueDetailSchema>;

export const listNfIssuesQuerySchema = z.object({
  status: nfIssueStatusSchema.optional(),
  ibge_code: z
    .string()
    .length(7)
    .regex(/^\d{7}$/)
    .optional(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  correlation_id: z.string().uuid().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ListNfIssuesQuery = z.infer<typeof listNfIssuesQuerySchema>;

export const nfIssueListItemSchema = z.object({
  id: z.string().uuid(),
  status: nfIssueStatusSchema,
  ibge_code: z.string(),
  competence_date: z.string(),
  amount_cents: z.number(),
  focus_ref: z.string().nullable(),
  created_at: z.string(),
});

export type NfIssueListItem = z.infer<typeof nfIssueListItemSchema>;

export const nfIssueStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  by_status: z.record(z.string(), z.number().int().nonnegative()),
  last_7_days: z.number().int().nonnegative(),
  pilot_municipios: z.array(
    z.object({
      ibge_code: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export type NfIssueStats = z.infer<typeof nfIssueStatsSchema>;
