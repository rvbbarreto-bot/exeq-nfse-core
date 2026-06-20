import { z } from "zod";

export const chargeStatusSchema = z.enum([
  "pending",
  "registered",
  "paid",
  "overdue",
  "cancelled",
  "failed",
]);

export type ChargeStatus = z.infer<typeof chargeStatusSchema>;

export const gatewayIntegrationModeSchema = z.enum(["mock", "http"]);
export type GatewayIntegrationMode = z.infer<typeof gatewayIntegrationModeSchema>;

/** Modo de integração inferido pela referência persistida (mock-* vs gateway HTTP). */
export function inferGatewayIntegrationMode(
  gatewayRef: string | null | undefined,
): GatewayIntegrationMode | null {
  if (!gatewayRef) return null;
  return gatewayRef.startsWith("mock-") ? "mock" : "http";
}

const CHARGE_TRANSITIONS: Record<ChargeStatus, ChargeStatus[]> = {
  pending: ["registered", "paid", "cancelled", "failed"],
  registered: ["paid", "cancelled", "failed"],
  paid: [],
  overdue: ["paid", "cancelled"],
  cancelled: [],
  failed: [],
};

export class InvalidChargeTransitionError extends Error {
  constructor(
    readonly from: ChargeStatus,
    readonly to: ChargeStatus,
  ) {
    super(`INVALID_CHARGE_TRANSITION:${from}->${to}`);
    this.name = "InvalidChargeTransitionError";
  }
}

export function canTransitionCharge(from: ChargeStatus, to: ChargeStatus): boolean {
  return CHARGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertChargeTransition(from: ChargeStatus, to: ChargeStatus): void {
  if (!canTransitionCharge(from, to)) {
    throw new InvalidChargeTransitionError(from, to);
  }
}

export function isTerminalChargeStatus(status: ChargeStatus): boolean {
  return ["paid", "cancelled", "failed"].includes(status);
}

export const createChargeSchema = z.object({
  idempotency_key: z.string().min(8).max(128),
  customer_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(2).max(500).optional(),
  nf_issue_id: z.string().uuid().optional(),
});

export type CreateChargeRequest = z.infer<typeof createChargeSchema>;

export const chargeDetailSchema = z.object({
  id: z.string().uuid(),
  status: chargeStatusSchema,
  idempotency_key: z.string(),
  customer_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  due_date: z.string(),
  description: z.string().nullable(),
  gateway_ref: z.string().nullable(),
  gateway_mode: gatewayIntegrationModeSchema.nullable().optional(),
  gateway_sandbox_url: z.string().url().nullable().optional(),
  nf_issue_id: z.string().uuid().nullable(),
  correlation_id: z.string().uuid(),
  created_at: z.string(),
  payment_events: z.array(
    z.object({
      id: z.string().uuid(),
      amount_cents: z.number().int().positive(),
      paid_at: z.string(),
      gateway_ref: z.string().nullable(),
      webhook_inbox_id: z.string().uuid().nullable(),
      created_at: z.string(),
    }),
  ),
});

export type ChargeDetail = z.infer<typeof chargeDetailSchema>;

export const listChargesQuerySchema = z.object({
  status: chargeStatusSchema.optional(),
  correlation_id: z.string().uuid().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  nf_issue_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ListChargesQuery = z.infer<typeof listChargesQuerySchema>;

export const chargeListItemSchema = z.object({
  id: z.string().uuid(),
  status: chargeStatusSchema,
  idempotency_key: z.string(),
  customer_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  due_date: z.string(),
  description: z.string().nullable(),
  gateway_ref: z.string().nullable(),
  nf_issue_id: z.string().uuid().nullable(),
  correlation_id: z.string().uuid(),
  created_at: z.string(),
});

export type ChargeListItem = z.infer<typeof chargeListItemSchema>;

export const chargeStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  paid_last_7_days: z.number().int().nonnegative(),
  failed_last_7_days: z.number().int().nonnegative(),
});

export type ChargeStats = z.infer<typeof chargeStatsSchema>;
