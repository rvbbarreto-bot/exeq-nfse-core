import { z } from "zod";
import { getMissingV11aFields, getMissingTomadorAddressFields, type ChannelLabeledFields, onlyDigits, normalizeIbge } from "./channel-labeled-parser.js";
import { emitNfseRequestSchema } from "./nf-issue.js";
import { emitTomadorAddressSchema } from "./emit-tomador.js";

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
      /** Bloqueio de confirmação por falha na prévia tributária. */
      tax_preview_block: z.string().max(500).optional(),
      /** Resumo da última prévia tributária bem-sucedida. */
      tax_preview_summary: z
        .object({
          engine: z.enum(["iss_legacy", "hybrid", "ibs_cbs_v1"]),
          iss_amount_cents: z.number().int(),
          ibs_amount_cents: z.number().int().optional(),
          cbs_amount_cents: z.number().int().optional(),
          ready: z.boolean(),
        })
        .optional(),
    })
    .optional(),
});

export type ChannelDraft = z.infer<typeof channelDraftSchema>;

/** Mescla patch no draft preservando sub-objetos (endereço tomador, flags). */
export function mergeChannelDraftPatch(
  base: ChannelDraft | Partial<ChannelDraft> | undefined,
  patch: Partial<ChannelDraft>,
): ChannelDraft {
  const next = { ...(base ?? {}), ...patch } as ChannelDraft;

  if (patch.tomador_address || base?.tomador_address) {
    const mergedAddr = { ...(base?.tomador_address ?? {}) };
    for (const [key, value] of Object.entries(patch.tomador_address ?? {})) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      mergedAddr[key as keyof typeof mergedAddr] = value;
    }
    next.tomador_address = mergedAddr;
  }

  if (patch.conversation_flags || base?.conversation_flags) {
    next.conversation_flags = {
      ...(base?.conversation_flags ?? {}),
      ...(patch.conversation_flags ?? {}),
    };
  }

  return next;
}

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

function draftToV11aFields(draft: ChannelDraft): ChannelLabeledFields {
  return {
    tomador_name: draft.tomador_name,
    tomador_document: draft.tomador_document,
    tomador_street: draft.tomador_address?.street,
    tomador_number: draft.tomador_address?.number,
    tomador_district: draft.tomador_address?.district,
    tomador_zip: draft.tomador_address?.zip_code,
    tomador_city_ibge: draft.tomador_address?.ibge_code,
    amount_label:
      draft.amount_cents != null
        ? (draft.amount_cents / 100).toFixed(2).replace(".", ",")
        : undefined,
    description: draft.description,
    competence_label: draft.competence_date,
    service_code: draft.service_code ?? draft.service_hint,
    ibge_code: draft.ibge_code,
  };
}

function buildEmitTomadorFromDraft(draft: ChannelDraft) {
  const addr = draft.tomador_address;
  if (!addr?.street || !addr.number || !addr.district || !addr.zip_code || !addr.ibge_code) {
    return undefined;
  }
  const parsed = emitTomadorAddressSchema.safeParse({
    street: addr.street,
    number: addr.number,
    district: addr.district,
    zip_code: onlyDigits(addr.zip_code),
    ibge_code: normalizeIbge(addr.ibge_code) ?? addr.ibge_code,
    complement: addr.complement,
    uf: addr.state,
  });
  if (!parsed.success) return undefined;

  const doc = draft.tomador_document ? onlyDigits(draft.tomador_document) : undefined;
  return {
    document: doc && (doc.length === 11 || doc.length === 14) ? doc : undefined,
    name: draft.tomador_name,
    email: draft.tomador_email?.includes("@") ? draft.tomador_email : undefined,
    address: parsed.data,
  };
}

/** Gate WhatsApp: IDs resolvidos + campos V11A + endereço tomador coletados. */
export function isChannelDraftReadyForConfirm(draft: ChannelDraft): boolean {
  if (draft.conversation_flags?.tax_preview_block) return false;
  if (!isDraftReady(draft)) return false;
  const labeled = draftToV11aFields(draft);
  if (getMissingV11aFields(labeled).length > 0) return false;
  return getMissingTomadorAddressFields(labeled).length === 0;
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
    tomador: buildEmitTomadorFromDraft(draft),
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
