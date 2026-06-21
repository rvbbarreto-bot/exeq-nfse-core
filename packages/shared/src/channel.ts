import { z } from "zod";
import { emitNfseRequestSchema } from "./nf-issue.js";

export const channelSessionStatusSchema = z.enum([
  "collecting",
  "ready_to_confirm",
  "emitted",
  "expired",
  "cancelled",
  "emitting",
  "error",
  "pending_review",
]);

export type ChannelSessionStatus = z.infer<typeof channelSessionStatusSchema>;

export const channelTomadorAddressSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  zip_code: z.string().optional(),
  ibge_code: z.string().optional(),
  state: z.string().optional(),
});

export const channelDraftSchema = z.object({
  provider_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  ibge_code: z.string().length(7).regex(/^\d{7}$/).optional(),
  competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.number().int().positive().optional(),
  description: z.string().min(2).max(2000).optional(),
  /** Campos conversacionais V11A (resolvidos para customer_id/service_id no Core). */
  tomador_name: z.string().min(2).max(255).optional(),
  tomador_document: z.string().optional(),
  service_code: z.string().min(1).max(32).optional(),
  tomador_email: z.string().max(255).optional(),
  tomador_address: channelTomadorAddressSchema.optional(),
  /** Termo bruto de cidade (LLM/parser) — resolvido para ibge_code no Core. */
  city_hint: z.string().max(120).optional(),
  /** Descrição livre do serviço (LLM) — resolvido para service_id no Core. */
  service_hint: z.string().max(255).optional(),
  conversation_flags: z
    .object({
      repeat_offer_pending: z.boolean().optional(),
      /** Primeira saudação já enviada nesta sessão — evita repetir template inicial. */
      greeted: z.boolean().optional(),
      /** Lista V11A de campos faltantes já enviada — evita repetir a cada cumprimento/intenção. */
      missing_list_sent: z.boolean().optional(),
      /** Serviços ambíguos detectados pelo hint LLM. */
      service_ambiguous_options: z
        .array(z.object({ service_code: z.string(), description: z.string() }))
        .optional(),
    })
    .optional(),
});

export type ChannelDraft = z.infer<typeof channelDraftSchema>;

export const REQUIRED_DRAFT_FIELDS = [
  "provider_id",
  "customer_id",
  "service_id",
  "ibge_code",
  "competence_date",
  "amount_cents",
] as const satisfies readonly (keyof ChannelDraft)[];

export function getMissingDraftFields(draft: ChannelDraft): (typeof REQUIRED_DRAFT_FIELDS)[number][] {
  return REQUIRED_DRAFT_FIELDS.filter((key) => draft[key] === undefined);
}

export function isDraftReady(draft: ChannelDraft): boolean {
  return getMissingDraftFields(draft).length === 0;
}

export function draftToEmitRequest(
  draft: ChannelDraft,
  idempotencyKey: string,
): z.infer<typeof emitNfseRequestSchema> {
  const missing = getMissingDraftFields(draft);
  if (missing.length > 0) {
    throw new Error(`CHANNEL_DRAFT_INCOMPLETE:${missing.join(",")}`);
  }
  return emitNfseRequestSchema.parse({
    idempotency_key: idempotencyKey,
    provider_id: draft.provider_id,
    customer_id: draft.customer_id,
    service_id: draft.service_id,
    ibge_code: draft.ibge_code,
    competence_date: draft.competence_date,
    amount_cents: draft.amount_cents,
    description: draft.description,
  });
}

export const createChannelSessionSchema = z.object({
  phone_e164: z.string().min(10).max(20).regex(/^\+?\d+$/),
  idempotency_key: z.string().min(8).max(128),
});

export type CreateChannelSessionRequest = z.infer<typeof createChannelSessionSchema>;

export const collectChannelSessionSchema = channelDraftSchema.partial();

export type CollectChannelSessionRequest = z.infer<typeof collectChannelSessionSchema>;

export const channelNotificationEventSchema = z.enum([
  "nf.authorized",
  "nf.rejected",
  "nf.cancelled",
  "nf.failed",
]);

export type ChannelNotificationEvent = z.infer<typeof channelNotificationEventSchema>;

export function buildChannelStatusMessage(
  event: ChannelNotificationEvent,
  ctx: {
    focus_ref?: string | null;
    issue_id: string;
    nfse_provider_kind?: "focus_nacional" | "betha" | string | null;
  },
): string {
  const providerLabel = ctx.nfse_provider_kind === "betha" ? "Betha" : "Focus";
  const ref = ctx.focus_ref ?? "—";

  switch (event) {
    case "nf.authorized":
      return `Sua NFS-e foi autorizada. Ref ${providerLabel}: ${ref}. Protocolo: ${ctx.issue_id.slice(0, 8)}.`;
    case "nf.rejected":
      return `Nao foi possivel autorizar a NFS-e. Protocolo: ${ctx.issue_id.slice(0, 8)}. Fale com seu contador.`;
    case "nf.cancelled":
      return `A NFS-e foi cancelada. Protocolo: ${ctx.issue_id.slice(0, 8)}.`;
    case "nf.failed":
      return `Ocorreu uma falha tecnica na emissao. Protocolo: ${ctx.issue_id.slice(0, 8)}. Tentaremos reprocessar ou contate suporte.`;
    default:
      return `Atualizacao NFS-e: ${ctx.issue_id.slice(0, 8)}.`;
  }
}
