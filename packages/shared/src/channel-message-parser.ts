import type { ChannelDraft } from "./channel.js";
import {
  getChannelCollectMissingFields,
  isChannelDraftReadyForConfirm,
  sanitizeDraftForMissingCheck,
} from "./channel.js";
import {
  applyTomadorCityToAddress,
  buildV11aConfirmationReply,
  buildV11aMissingReply,
  extractLabeledChannelFields,
  extractTomadorCityFromPhrase,
  getMissingV11aFields,
  getMissingTomadorAddressFields,
  isTomadorCityPhrase,
  onlyDigits,
  parseAmountCentsFromLabel,
  parseAmountCentsFromFreeformText,
  parseCompetenceIsoFromLabel,
  type ChannelLabeledFields,
} from "./channel-labeled-parser.js";
import {
  appendTaxPreviewToConfirmation,
  buildChannelTaxPreviewBlockedReply,
  type ChannelTaxPreviewSummary,
} from "./channel-tax-preview.js";
import {
  type ChannelMessageIntent,
  type ParsedChannelMessage,
  isDataRequestMessage,
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
  isDataRequestMessage,
  isVagueEmissionPhrase,
  looksLikeFiscalServiceCode,
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
  const normalized = text.trim();
  if (/^emitir\s+(uma\s+)?no?ts?\s*$/i.test(normalized)) return undefined;
  if (EMISSION_INTENT_RE.test(normalized)) return undefined;

  const servicePrefix = parseServicePrefixText(text);
  if (servicePrefix?.description) return servicePrefix.description;

  const labeled = text.match(/(?:descri[cç][aã]o|servi[cç]o|servico)\s*[:\-]\s*(.+)$/i);
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 2000);
  const free = text.match(/^emitir\s+(.+)$/i);
  if (free?.[1]?.trim()) {
    const tail = free[1].trim();
    if (/^(uma\s+)?(no?ts?|nota)\s*$/i.test(tail)) return undefined;
    return tail.slice(0, 2000);
  }
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

  const tomadorAddress: NonNullable<ChannelDraft["tomador_address"]> = {};
  if (labeled.tomador_street) tomadorAddress.street = labeled.tomador_street;
  if (labeled.tomador_number) tomadorAddress.number = labeled.tomador_number;
  if (labeled.tomador_complement) tomadorAddress.complement = labeled.tomador_complement;
  if (labeled.tomador_district) tomadorAddress.district = labeled.tomador_district;
  if (labeled.tomador_zip) tomadorAddress.zip_code = labeled.tomador_zip.replace(/\D/g, "");
  if (labeled.tomador_state) tomadorAddress.state = labeled.tomador_state.toUpperCase();
  if (labeled.tomador_city_ibge) applyTomadorCityToAddress(tomadorAddress, labeled.tomador_city_ibge);

  if (Object.keys(tomadorAddress).length > 0) {
    patch.tomador_address = tomadorAddress;
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
  const competence = parseCompetenceIsoFromLabel(normalized);
  if (competence) patch.competence_date = competence;
  if (isTomadorCityPhrase(normalized)) {
    const city = extractTomadorCityFromPhrase(normalized);
    if (city) {
      const addr: NonNullable<ChannelDraft["tomador_address"]> = { ...(ctx?.currentDraft?.tomador_address ?? {}) };
      applyTomadorCityToAddress(addr, city);
      patch.tomador_address = addr;
    }
  } else {
    const description = parseDescription(normalized);
    if (description && !competence) patch.description = description;
    const ibge = resolveMunicipioIbgeFromText(normalized);
    if (ibge) patch.ibge_code = ibge;
  }
  const servicePrefixInline = parseServicePrefixText(normalized);
  if (servicePrefixInline?.service_hint) patch.service_hint = servicePrefixInline.service_hint;

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
  const sanitized = sanitizeDraftForMissingCheck(draft);
  const taxBlock = sanitized.conversation_flags?.tax_preview_block;
  if (missing.length === 0 && taxBlock) {
    return buildChannelTaxPreviewBlockedReply(taxBlock);
  }

  const taxSummary = sanitized.conversation_flags?.tax_preview_summary as
    | ChannelTaxPreviewSummary
    | undefined;

  if (missing.length === 0 && isChannelDraftReadyForConfirm(sanitized)) {
    const labeled: ChannelLabeledFields = options?.labeled ?? {
      tomador_name: sanitized.tomador_name,
      tomador_document: sanitized.tomador_document,
      amount_label:
        sanitized.amount_cents != null
          ? (sanitized.amount_cents / 100).toFixed(2).replace(".", ",")
          : undefined,
      description: sanitized.description,
      competence_label: sanitized.competence_date,
      service_code: sanitized.service_code,
      ibge_code: municipioLabelFromIbge(sanitized.ibge_code) ?? sanitized.ibge_code,
      tomador_email: sanitized.tomador_email,
      tomador_street: sanitized.tomador_address?.street,
      tomador_number: sanitized.tomador_address?.number,
      tomador_complement: sanitized.tomador_address?.complement,
      tomador_district: sanitized.tomador_address?.district,
      tomador_city_ibge:
        sanitized.tomador_address?.ibge_code ?? sanitized.tomador_address?.city_name,
      tomador_state: sanitized.tomador_address?.state,
      tomador_zip: sanitized.tomador_address?.zip_code,
    };

    const base = buildV11aConfirmationReply(labeled);
    return taxSummary?.ready ? appendTaxPreviewToConfirmation(base, taxSummary) : base;
  }

  const allMissing = getChannelCollectMissingFields(sanitized);

  if (allMissing.length > 0) {
    return buildV11aMissingReply(options?.contact_name, allMissing);
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
