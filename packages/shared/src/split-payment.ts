import { z } from "zod";

export const SPLIT_PAYMENT_SCHEMA_VERSION = 1 as const;

export const splitPaymentTaxKindSchema = z.enum(["iss", "ibs", "cbs"]);
export type SplitPaymentTaxKind = z.infer<typeof splitPaymentTaxKindSchema>;

export const splitPaymentBeneficiarySchema = z.enum([
  "municipio",
  "uf",
  "uniao",
  "federal",
]);
export type SplitPaymentBeneficiary = z.infer<typeof splitPaymentBeneficiarySchema>;

export const splitPaymentStatusSchema = z.enum([
  "not_applicable",
  "pending",
  "sandbox",
]);
export type SplitPaymentStatus = z.infer<typeof splitPaymentStatusSchema>;

export const splitPaymentAllocationSchema = z.object({
  tax_kind: splitPaymentTaxKindSchema,
  beneficiary: splitPaymentBeneficiarySchema,
  ibge_code: z.string().length(7).optional(),
  amount_cents: z.number().int().nonnegative(),
  rate: z.number().nonnegative(),
});

export type SplitPaymentAllocation = z.infer<typeof splitPaymentAllocationSchema>;

export const splitPaymentV1Schema = z.object({
  version: z.literal(SPLIT_PAYMENT_SCHEMA_VERSION),
  status: splitPaymentStatusSchema,
  total_cents: z.number().int().nonnegative(),
  allocations: z.array(splitPaymentAllocationSchema),
  note: z.string().optional(),
});

export type SplitPaymentV1 = z.infer<typeof splitPaymentV1Schema>;

export type BuildSplitPaymentInput = {
  engine: "iss_legacy" | "hybrid" | "ibs_cbs_v1";
  municipio_destino_ibge: string;
  resolved_taxes: {
    iss?: { rate: number; amount_cents: number };
    ibs?: { rate: number; amount_cents: number };
    cbs?: { rate: number; amount_cents: number };
  };
};

/** Monta repartição sandbox v1 a partir do motor fiscal (Marco 2029). */
export function buildSplitPaymentV1(input: BuildSplitPaymentInput): SplitPaymentV1 {
  if (input.engine === "iss_legacy") {
    return {
      version: SPLIT_PAYMENT_SCHEMA_VERSION,
      status: "not_applicable",
      total_cents: 0,
      allocations: [],
      note: "Split payment LC214 não aplicável em ISS legado",
    };
  }

  const allocations: SplitPaymentAllocation[] = [];

  if (input.resolved_taxes.iss && input.resolved_taxes.iss.amount_cents > 0) {
    allocations.push({
      tax_kind: "iss",
      beneficiary: "municipio",
      ibge_code: input.municipio_destino_ibge,
      amount_cents: input.resolved_taxes.iss.amount_cents,
      rate: input.resolved_taxes.iss.rate,
    });
  }

  if (input.resolved_taxes.ibs && input.resolved_taxes.ibs.amount_cents > 0) {
    allocations.push({
      tax_kind: "ibs",
      beneficiary: "uf",
      amount_cents: input.resolved_taxes.ibs.amount_cents,
      rate: input.resolved_taxes.ibs.rate,
    });
  }

  if (input.resolved_taxes.cbs && input.resolved_taxes.cbs.amount_cents > 0) {
    allocations.push({
      tax_kind: "cbs",
      beneficiary: "uniao",
      amount_cents: input.resolved_taxes.cbs.amount_cents,
      rate: input.resolved_taxes.cbs.rate,
    });
  }

  const total_cents = allocations.reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    version: SPLIT_PAYMENT_SCHEMA_VERSION,
    status: "sandbox",
    total_cents,
    allocations,
    note: "Sandbox LC214 — sem liquidação/billing real",
  };
}

export function parseSplitPaymentV1(raw: unknown): SplitPaymentV1 {
  return splitPaymentV1Schema.parse(raw);
}
