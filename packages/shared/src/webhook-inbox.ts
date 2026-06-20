import { z } from "zod";

export const webhookInboxStatusSchema = z.enum([
  "received",
  "processing",
  "processed",
  "failed",
]);

export type WebhookInboxStatus = z.infer<typeof webhookInboxStatusSchema>;

export const gatewayWebhookEventSchema = z.enum(["payment.paid", "payment.failed"]);

export const gatewayWebhookPayloadSchema = z
  .object({
    idempotency_key: z.string().min(8).max(128),
    event: gatewayWebhookEventSchema,
    charge_id: z.string().uuid().optional(),
    gateway_ref: z.string().min(1).max(128).optional(),
    amount_cents: z.number().int().positive(),
    paid_at: z.string().datetime().optional(),
  })
  .refine((v) => v.charge_id || v.gateway_ref, {
    message: "charge_id ou gateway_ref obrigatorio",
  });

export type GatewayWebhookPayload = z.infer<typeof gatewayWebhookPayloadSchema>;

export const webhookReceiveResponseSchema = z.object({
  inbox_id: z.string().uuid(),
  status: webhookInboxStatusSchema,
  duplicate: z.boolean().optional(),
});

export type WebhookReceiveResponse = z.infer<typeof webhookReceiveResponseSchema>;

export const webhookInboxListItemSchema = z.object({
  id: z.string().uuid(),
  status: webhookInboxStatusSchema,
  idempotency_key: z.string(),
  error_message: z.string().nullable(),
  charge_id: z.string().uuid().nullable(),
  created_at: z.string(),
  processed_at: z.string().nullable(),
});

export type WebhookInboxListItem = z.infer<typeof webhookInboxListItemSchema>;

export const listWebhookInboxQuerySchema = z.object({
  status: webhookInboxStatusSchema.optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ListWebhookInboxQuery = z.infer<typeof listWebhookInboxQuerySchema>;
