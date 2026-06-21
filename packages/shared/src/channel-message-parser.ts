import type { ChannelDraft } from "./channel.js";
import {
  buildV11aConfirmationReply,
  buildV11aMissingReply,
  extractLabeledChannelFields,
  getMissingV11aFields,
  onlyDigits,
  parseAmountCentsFromLabel,
  parseAmountCentsFromFreeformText,
  parseCompetenceIsoFromLabel,
  type ChannelLabeledFields,
} from "./channel-labeled-parser.js";
import {
  type ChannelMessageIntent,
  type ParsedChannelMessage,
  parseServicePrefixText,
  patchFromContextualMessage,
  patchSingleMissingField,
} from "./channel-conversation.js";
import { municipioLabelFromIbge, resolveMunicipioIbgeFromText } from "./pilot-municipios.js";

export type { ChannelMessageIntent, ParsedChannelMessage };
export {
  buildContinuesListeningReply,
  buildGreetingReply,
  buildEmissionIntentReply,
  buildShortGreetingAck,
  firstName,
  isConversationStarted,
  parseServicePrefixText,
  patchFromContextualMessage,
  patchSingleMissingField,
} from "./channel-conversation.js";

const CONFIRM_RE =
  /^(confirmar|confirmo|ok|sim|pode emitir|pode gerar|autorizar|segue|pode prosseguir)[\s.!]*$/i;

const CANCEL_RE = /^(cancelar|cancela|desistir|nao|não)[\s.!]*$/i;

const HELP_RE = /^(ajuda|help|\?|como emitir)$/i;

const GREETING_RE =
  /^(oi+|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|td bem|tudo certo|como vai|opa|fala|salve)(?:[\s,!?.]+.*)?$/i;

const EMISSION_INTENT_RE =
  /\b(quer(?:o|ia)?|preciso|quero|vou|pode|podemos|emitir|gerar|fazer|mandar|enviar|solicitar)\b.*\b(nota|nfse|nfs-?e|nf)\b/i;

const REPEAT_LAST_RE =
  /^(sim[,!.]?\s*)?(mesmos?\s*dados|repetir|igual\s+a\s+ultima|igual\s+anterior|ultima\s+nota|mesma\s+nota|pode\s+ser|isso|confirmo)/i;

function parseDescription(text: string): string | undefined {
  const servicePrefix = parseServicePrefixText(text);
  if (servicePrefix?.description) return servicePrefix.description;

  const labeled = text.match(/(?:descri[cç][aã]o|servi[cç]o|servico)\s*[:\-]\s*(.+)$/i);
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 2000);
  const free = text.match(/^emitir\s+(.+)$/i);
  if (free?.[1]?.trim() && free[1].trim().length >= 3) return free[1].trim().slice(0, 2000);
  return undefined;
}

function buildPatchFromLabeled(labeled: ChannelLabeledFields): Partial<ChannelDraft> {
  const patch: Partial<ChannelDraft> = {};
  if (labeled.tomador_name) patch.tomador_name = labeled.tomador_name;
  if (labeled.tomador_document) patch.tomador_document = labeled.tomador_document;
  const amountLabeled = parseAmountCentsFromLabel(labeled.amount_label ?? "");
  if (amountLabeled != null && amountLabeled > 0) patch.amount_cents = amountLabeled;
  if (labeled.description) patch.description = labeled.description.slice(0, 2000);
  const compLabeled = parseCompetenceIsoFromLabel(labeled.competence_label ?? "");
  if (compLabeled) patch.competence_date = compLabeled;
  if (labeled.service_code) patch.service_code = labeled.service_code.replace(/\s/g, "");
  const ibgeLabeled = labeled.ibge_code?.replace(/\D/g, "");
  if (ibgeLabeled?.length === 7) {
    patch.ibge_code = ibgeLabeled;
  } else if (labeled.ibge_code) {
    const fromCity = resolveMunicipioIbgeFromText(labeled.ibge_code);
    if (fromCity) patch.ibge_code = fromCity;
  }
  if (labeled.tomador_email) patch.tomador_email = labeled.tomador_email;
  const addr =
    labeled.tomador_street ||
    labeled.tomador_number ||
    labeled.tomador_complement ||
    labeled.tomador_district ||
    labeled.tomador_zip ||
    labeled.tomador_city_ibge ||
    labeled.tomador_state;
  if (addr) {
    patch.tomador_address = {
      street: labeled.tomador_street,
      number: labeled.tomador_number,
      complement: labeled.tomador_complement,
      district: labeled.tomador_district,
      zip_code: labeled.tomador_zip?.replace(/\D/g, ""),
      ibge_code: labeled.tomador_city_ibge?.replace(/\D/g, "").slice(0, 7),
      state: labeled.tomador_state?.toUpperCase(),
    };
  }
  return patch;
}

/**
 * Parser conversacional PT-BR — texto ou áudio transcrito.
 * Acumula dados entre mensagens; não trata saudação como descrição fiscal.
 */
export function parseChannelMessageText(
  text: string,
  ctx?: { currentDraft?: ChannelDraft; repeatOfferPending?: boolean },
): ParsedChannelMessage {
  const raw = text.trim();
  if (!raw) {
    return { intent: "unknown", patch: {} };
  }

  const normalized = raw.replace(/\s+/g, " ");

  if (ctx?.repeatOfferPending && REPEAT_LAST_RE.test(normalized)) {
    return { intent: "repeat_last", patch: {} };
  }

  if (CONFIRM_RE.test(normalized)) {
    return { intent: "confirm", patch: {} };
  }
  if (CANCEL_RE.test(normalized)) {
    return { intent: "cancel", patch: {} };
  }
  if (HELP_RE.test(normalized)) {
    return { intent: "help", patch: {} };
  }

  const labeled = extractLabeledChannelFields(raw);
  if (Object.keys(labeled).length > 0) {
    return { intent: "inform", patch: buildPatchFromLabeled(labeled) };
  }

  if (ctx?.currentDraft) {
    const contextual = patchFromContextualMessage(normalized, ctx.currentDraft);
    if (Object.keys(contextual).length > 0) {
      return { intent: "inform", patch: contextual };
    }

    const single = patchSingleMissingField(normalized, ctx.currentDraft);
    if (single && Object.keys(single).length > 0) {
      return { intent: "inform", patch: single };
    }
  }

  const patch: Partial<ChannelDraft> = {};
  const formattedDoc = normalized.match(/\b[\d./-]{14,22}\b/);
  if (formattedDoc?.[0]) {
    const doc = onlyDigits(formattedDoc[0]);
    if (doc.length === 11 || doc.length === 14) patch.tomador_document = doc;
  }
  const amount = parseAmountCentsFromFreeformText(normalized);
  if (amount != null && amount > 0) patch.amount_cents = amount;
  const description = parseDescription(normalized);
  if (description) patch.description = description;
  const servicePrefixInline = parseServicePrefixText(normalized);
  if (servicePrefixInline?.service_hint) patch.service_hint = servicePrefixInline.service_hint;
  const competence = parseCompetenceIsoFromLabel(normalized);
  if (competence) patch.competence_date = competence;
  const ibge = resolveMunicipioIbgeFromText(normalized);
  if (ibge) patch.ibge_code = ibge;

  if (Object.keys(patch).length > 0) {
    return { intent: "inform", patch };
  }

  const servicePrefix = parseServicePrefixText(normalized);
  if (servicePrefix && Object.keys(servicePrefix).length > 0) {
    return { intent: "inform", patch: servicePrefix };
  }

  if (EMISSION_INTENT_RE.test(normalized)) {
    return { intent: "emission_intent", patch: {} };
  }

  if (GREETING_RE.test(normalized)) {
    return { intent: "greeting", patch: {} };
  }

  return { intent: "unknown", patch: {} };
}

export function buildChannelCollectReply(
  missing: string[],
  draft: ChannelDraft,
  options?: { contact_name?: string; labeled?: ChannelLabeledFields },
): string {
  if (missing.length === 0) {
    const labeled: ChannelLabeledFields = options?.labeled ?? {
      tomador_name: draft.tomador_name,
      tomador_document: draft.tomador_document,
      amount_label:
        draft.amount_cents != null
          ? (draft.amount_cents / 100).toFixed(2).replace(".", ",")
          : undefined,
      description: draft.description,
      competence_label: draft.competence_date,
      service_code: draft.service_code,
      ibge_code: municipioLabelFromIbge(draft.ibge_code) ?? draft.ibge_code,
      tomador_email: draft.tomador_email,
      tomador_street: draft.tomador_address?.street,
      tomador_number: draft.tomador_address?.number,
      tomador_complement: draft.tomador_address?.complement,
      tomador_district: draft.tomador_address?.district,
      tomador_city_ibge: draft.tomador_address?.ibge_code,
      tomador_state: draft.tomador_address?.state,
      tomador_zip: draft.tomador_address?.zip_code,
    };

    if (labeled.tomador_name && labeled.tomador_document) {
      return buildV11aConfirmationReply(labeled);
    }

    const valor = draft.amount_cents != null ? (draft.amount_cents / 100).toFixed(2) : "?";
    const cidade = municipioLabelFromIbge(draft.ibge_code) ?? draft.ibge_code ?? "—";
    return (
      `Resumo da NFS-e:\n` +
      `- Valor: R$ ${valor}\n` +
      `- Serviço: ${draft.description ?? "(padrão)"}\n` +
      `- Cidade: ${cidade}\n\n` +
      `Responda *confirmar* para emitir ou *cancelar* para desistir.`
    );
  }

  const v11aMissing = getMissingV11aFields({
    tomador_name: draft.tomador_name,
    tomador_document: draft.tomador_document,
    amount_label:
      draft.amount_cents != null ? String(draft.amount_cents / 100) : undefined,
    description: draft.description,
    competence_label: draft.competence_date,
    service_code: draft.service_code,
    ibge_code: draft.ibge_code,
  });

  if (v11aMissing.length > 0) {
    return buildV11aMissingReply(options?.contact_name, v11aMissing);
  }

  const hints: Record<string, string> = {
    provider_id: "prestador (configurado automaticamente)",
    customer_id: "tomador (cadastro)",
    service_id: "serviço (catálogo)",
    ibge_code: "cidade da prestação",
    competence_date: "data da prestação (dd/mm/aaaa ou ontem/hoje)",
    amount_cents: "valor (ex.: R$ 1.400,89)",
  };

  const need = missing.map((f) => hints[f] ?? f).join(", ");
  return (
    `Para emitir a NFS-e, informe: ${need}.\n\n` +
    `Pode enviar em mensagens separadas — informo só o que ainda faltar.\n` +
    `Digite *ajuda* para instruções.`
  );
}

export function buildChannelHelpReply(): string {
  return (
    `*Emissão NFS-e via WhatsApp*\n\n` +
    `1. Converse normalmente — pode mandar "bom dia" e depois os dados em várias mensagens.\n` +
    `2. Envie tomador, documento, valor, descrição, data, código do serviço e *cidade* da prestação.\n` +
    `3. Revise o resumo e responda *confirmar*.\n` +
    `4. Áudio também funciona (transcrição no n8n).\n\n` +
    `Comandos: *confirmar* | *cancelar* | *ajuda* | *sim* (repetir última nota)`
  );
}
