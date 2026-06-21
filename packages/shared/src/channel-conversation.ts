import type { ChannelDraft } from "./channel.js";
import {
  CHANNEL_V11A_REQUIRED,
  getMissingV11aFields,
  onlyDigits,
  parseAmountCentsFromLabel,
  parseAmountCentsFromFreeformText,
  parseCompetenceIsoFromLabel,
  type ChannelLabeledFields,
} from "./channel-labeled-parser.js";
import { resolveMunicipioIbgeFromText } from "./pilot-municipios.js";

export type ChannelMessageIntent =
  | "confirm"
  | "cancel"
  | "help"
  | "inform"
  | "greeting"
  | "emission_intent"
  | "repeat_last"
  | "unknown";

export type ParsedChannelMessage = {
  intent: ChannelMessageIntent;
  patch: Partial<ChannelDraft>;
};

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

const SERVICE_CODE_RE = /\b(\d{1,2}\.\d{2}(?:\.\d{2})?|\d\.\d{2})\b/;

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function draftToLabeled(draft: ChannelDraft): ChannelLabeledFields {
  return {
    tomador_name: draft.tomador_name,
    tomador_document: draft.tomador_document,
    amount_label:
      draft.amount_cents != null
        ? (draft.amount_cents / 100).toFixed(2).replace(".", ",")
        : undefined,
    description: draft.description,
    competence_label: draft.competence_date,
    service_code: draft.service_code,
    ibge_code: draft.ibge_code,
  };
}

function extractTomadorDocument(text: string): string | undefined {
  const labeled = text.match(
    /\b(?:tomador|tomado|cliente|para(?:\s+o)?(?:\s+tomador)?)\s*(?:cpf|cnpj)?\s*[:\-]?\s*(\d{11,14})\b/i,
  );
  if (labeled?.[1]) return onlyDigits(labeled[1]);

  const docOnly = text.match(/\b(\d{11}|\d{14})\b/);
  if (docOnly?.[1]) return docOnly[1];

  const formatted = text.match(/\b[\d./-]{14,22}\b/);
  if (formatted?.[0]) {
    const doc = onlyDigits(formatted[0]);
    if (doc.length === 11 || doc.length === 14) return doc;
  }

  return undefined;
}

function extractServiceCode(text: string): string | undefined {
  const m = text.match(SERVICE_CODE_RE);
  return m?.[1]?.replace(/\s/g, "");
}

/** "serviço desenvolvimento de software" → hint/descrição (sem dois-pontos). */
export function parseServicePrefixText(text: string): Partial<ChannelDraft> | null {
  const m = normalizeText(text).match(/^(?:servi[cç]o|servico)\s+(.+)$/i);
  const hint = m?.[1]?.trim();
  if (!hint || hint.length < 3) return null;
  const clipped = hint.slice(0, 2000);
  return { service_hint: clipped.slice(0, 255), description: clipped };
}

function extractDescriptionFreeform(text: string): string | undefined {
  const servicePrefix = parseServicePrefixText(text);
  if (servicePrefix?.description) return servicePrefix.description;

  const labeled = text.match(/(?:descri[cç][aã]o|servi[cç]o)\s*[:\-]\s*(.+)$/i);
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 2000);
  if (text.length >= 8 && !GREETING_RE.test(text) && !EMISSION_INTENT_RE.test(text)) {
    if (!extractTomadorDocument(text) && !parseAmountCentsFromLabel(text)) {
      return text.slice(0, 2000);
    }
  }
  return undefined;
}

/** Extrai campos faltantes a partir de mensagem livre (multi-turn). */
export function patchFromContextualMessage(
  text: string,
  draft: ChannelDraft,
): Partial<ChannelDraft> {
  const normalized = normalizeText(text);
  if (!normalized) return {};

  const missing = getMissingV11aFields(draftToLabeled(draft));
  if (missing.length === 0) {
    if (!draft.service_id) {
      const servicePrefix = parseServicePrefixText(normalized);
      if (servicePrefix && Object.keys(servicePrefix).length > 0) {
        return servicePrefix;
      }
    }
    return {};
  }

  const patch: Partial<ChannelDraft> = {};

  if (missing.includes("amount_label")) {
    const cents = parseAmountCentsFromFreeformText(normalized);
    if (cents != null && cents > 0) patch.amount_cents = cents;
  }

  if (missing.includes("competence_label")) {
    const iso = parseCompetenceIsoFromLabel(normalized);
    if (iso) patch.competence_date = iso;
  }

  if (missing.includes("tomador_document")) {
    const doc = extractTomadorDocument(normalized);
    if (doc) patch.tomador_document = doc;
  }

  if (missing.includes("ibge_code")) {
    const ibge = resolveMunicipioIbgeFromText(normalized);
    if (ibge) patch.ibge_code = ibge;
  }

  if (missing.includes("service_code")) {
    const code = extractServiceCode(normalized);
    if (code) patch.service_code = code;
    else {
      const servicePrefix = parseServicePrefixText(normalized);
      if (servicePrefix?.service_hint) {
        patch.service_hint = servicePrefix.service_hint;
        if (servicePrefix.description) patch.description = servicePrefix.description;
      }
    }
  }

  if (missing.includes("description")) {
    const desc = extractDescriptionFreeform(normalized);
    if (desc) patch.description = desc;
    else {
      const servicePrefix = parseServicePrefixText(normalized);
      if (servicePrefix?.description) patch.description = servicePrefix.description;
      if (servicePrefix?.service_hint) patch.service_hint = servicePrefix.service_hint;
    }
  }

  if (missing.includes("tomador_name") && missing.length === 1) {
    if (
      !parseServicePrefixText(normalized) &&
      !GREETING_RE.test(normalized) &&
      !EMISSION_INTENT_RE.test(normalized) &&
      !normalized.includes(":")
    ) {
      patch.tomador_name = normalized.slice(0, 255);
    }
  }

  return patch;
}

/** Resposta curta sem rótulo quando falta exatamente 1 campo V11A. */
export function patchSingleMissingField(
  text: string,
  draft: ChannelDraft,
): Partial<ChannelDraft> | null {
  const contextual = patchFromContextualMessage(text, draft);
  if (Object.keys(contextual).length > 0) return contextual;

  const missing = getMissingV11aFields(draftToLabeled(draft));
  if (missing.length !== 1) return null;

  const value = normalizeText(text);
  if (!value || value.includes(":")) return null;
  if (GREETING_RE.test(value) || EMISSION_INTENT_RE.test(value)) return null;

  const field = missing[0]!;
  const patch: Partial<ChannelDraft> = {};

  switch (field) {
    case "tomador_name":
      if (parseServicePrefixText(value)) return null;
      patch.tomador_name = value.slice(0, 255);
      break;
    case "tomador_document": {
      const doc = onlyDigits(value);
      if (doc.length === 11 || doc.length === 14) patch.tomador_document = doc;
      else return null;
      break;
    }
    case "amount_label": {
      const cents = parseAmountCentsFromLabel(value);
      if (cents != null && cents > 0) patch.amount_cents = cents;
      else return null;
      break;
    }
    case "description":
      patch.description = value.slice(0, 2000);
      break;
    case "competence_label": {
      const iso = parseCompetenceIsoFromLabel(value);
      if (iso) patch.competence_date = iso;
      else return null;
      break;
    }
    case "service_code": {
      const servicePrefix = parseServicePrefixText(value);
      if (servicePrefix?.service_hint) {
        patch.service_hint = servicePrefix.service_hint;
        if (servicePrefix.description) patch.description = servicePrefix.description;
      } else {
        patch.service_code = value.replace(/\s/g, "");
      }
      break;
    }
    case "ibge_code": {
      const ibge = onlyDigits(value);
      if (ibge.length === 7) patch.ibge_code = ibge;
      else {
        const fromCity = resolveMunicipioIbgeFromText(value);
        if (fromCity) patch.ibge_code = fromCity;
        else return null;
      }
      break;
    }
    default:
      return null;
  }

  return patch;
}

export function firstName(displayName: string | undefined): string {
  const raw = String(displayName ?? "").trim();
  if (!raw) return "";
  return raw.split(/\s+/)[0] ?? raw;
}

export function isConversationStarted(draft: ChannelDraft): boolean {
  if (draft.conversation_flags?.greeted === true) return true;
  return Boolean(
    draft.tomador_name ||
      draft.tomador_document ||
      draft.amount_cents ||
      draft.description ||
      draft.competence_date ||
      draft.service_code ||
      draft.service_hint ||
      draft.ibge_code,
  );
}

export function buildGreetingReply(
  displayName: string | undefined,
  hasLastEmission: boolean,
): string {
  const nome = firstName(displayName);
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  if (hasLastEmission) {
    return (
      `${saudacao} Tudo bem?\n\n` +
      `Quer que emitamos uma nova NFS-e com os *mesmos dados da última* nota autorizada?\n\n` +
      `Responda *sim* para repetir ou envie os dados da nova nota.\n` +
      `Digite *ajuda* para instruções.`
    );
  }
  return (
    `${saudacao} Tudo bem?\n\n` +
    `Posso ajudar com a emissão da NFS-e. Envie os dados aos poucos — vou reunindo tudo.\n\n` +
    `Preciso de: nome do cliente, CPF/CNPJ, valor, descrição, data, código do serviço e *cidade* da prestação (ex.: Atibaia).\n` +
    `Digite *ajuda* para ver o formato.`
  );
}

export function buildShortGreetingAck(displayName: string | undefined): string {
  const nome = firstName(displayName);
  return nome ? `Olá de novo, ${nome}!` : "Olá de novo!";
}

export function buildEmissionIntentReply(displayName: string | undefined): string {
  const nome = firstName(displayName);
  const prefix = nome ? `${nome}, ` : "";
  return (
    `${prefix}perfeito! Pode enviar os dados em várias mensagens — informo só o que ainda faltar.\n\n` +
    `Ex.: valor, data, nome do cliente, documento, descrição, código do serviço e cidade da prestação.`
  );
}

/** Turno social (cumprimento / intenção) sem repetir a lista V11A já enviada. */
export function buildContinuesListeningReply(displayName: string | undefined): string {
  const nome = firstName(displayName);
  const prefix = nome ? `${nome}, ` : "";
  return (
    `${prefix}certo! Pode mandar os dados quando quiser — vou reunindo tudo e aviso só o que ainda faltar.`
  );
}

/** Sessão em revisão humana — confiança LLM baixa ou ambiguidade. */
export function buildPendingReviewReply(displayName: string | undefined): string {
  const nome = firstName(displayName);
  const prefix = nome ? `${nome}, ` : "";
  return (
    `${prefix}recebi sua mensagem, mas alguns dados ficaram ambíguos.\n\n` +
    `Nossa equipe vai revisar e retornar em breve. Se preferir, envie os dados um por vez (valor, documento, cidade…).`
  );
}

/** Múltiplos serviços candidatos a partir do hint LLM. */
export function buildServiceAmbiguityReply(
  matches: Array<{ service_code: string; description: string }>,
): string {
  const lines = matches
    .slice(0, 3)
    .map((m) => `* ${m.service_code} — ${m.description}`)
    .join("\n");
  return (
    `Encontrei mais de um serviço parecido:\n\n${lines}\n\n` +
    `Responda com o código do serviço (ex.: 1.01) ou descreva com mais detalhe.`
  );
}

export { CHANNEL_V11A_REQUIRED };
