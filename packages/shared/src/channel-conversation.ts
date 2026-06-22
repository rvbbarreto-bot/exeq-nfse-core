import type { ChannelDraft } from "./channel.js";
import {
  CHANNEL_V11A_REQUIRED,
  applyTomadorCityToAddress,
  getMissingTomadorAddressFields,
  getMissingV11aFields,
  isTomadorCityPhrase,
  isValidFiscalDescription,
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

/** Cliente pergunta quais dados enviar — não é confirmação nem dado fiscal. */
const DATA_REQUEST_RE =
  /\b(quais|que)\s+(os\s+)?dados|o\s+que\s+(preciso|devo)\s+(enviar|mandar|informar|passar)|me\s+(fala|diga|explica|informa)|como\s+(fa[cç]o|procedo|solicito)\b/i;

export function isDataRequestMessage(text: string): boolean {
  return DATA_REQUEST_RE.test(normalizeText(text));
}

/** Intenção vaga de emissão — não é descrição fiscal nem dado confirmável. */
export function isVagueEmissionPhrase(text: string): boolean {
  const normalized = normalizeText(text);
  if (/^emitir\s+(uma\s+)?(no?ts?|nota)\s*$/i.test(normalized)) return true;
  if (EMISSION_INTENT_RE.test(normalized)) return true;
  if (/^(ol[aá],?\s+)?(quero|queria)\s*$/i.test(normalized)) return true;
  return false;
}

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
  const serviceCode =
    draft.service_code && looksLikeFiscalServiceCode(draft.service_code)
      ? draft.service_code
      : draft.service_hint
        ? draft.service_hint
        : draft.service_code;

  return {
    tomador_name: draft.tomador_name,
    tomador_document: draft.tomador_document,
    amount_label:
      draft.amount_cents != null
        ? (draft.amount_cents / 100).toFixed(2).replace(".", ",")
        : undefined,
    description: draft.description,
    competence_label: draft.competence_date,
    service_code: serviceCode,
    ibge_code: draft.ibge_code,
  };
}

/** Código fiscal LC116 (ex.: 1.01, 01.07.01) — distingue de texto livre. */
export function looksLikeFiscalServiceCode(value: string | undefined): boolean {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return false;
  return /^\d{1,2}(\.\d{2}){1,2}$/.test(raw) || /^\d\.\d{2}$/.test(raw);
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

/** "serviço desenvolvimento de software" / "o serviço é …" → hint/descrição. */
export function parseServicePrefixText(text: string): Partial<ChannelDraft> | null {
  const normalized = normalizeText(text);

  const patterns = [
    /^(?:o\s+)?servi[cç]o\s+(?:é|e)\s+(?:servi[cç]o|servico)\s+(.+)$/i,
    /^(?:servi[cç]o|servico)\s+(?:é|e)\s+(?:servi[cç]o|servico)\s+(.+)$/i,
    /^(?:o\s+)?servi[cç]o\s+(?:é|e)\s+(.+)$/i,
    /^(?:servi[cç]o|servico)\s+(?:é|e)\s+(.+)$/i,
    /^(?:servi[cç]o|servico)\s+(.+)$/i,
  ];

  for (const re of patterns) {
    const hint = re.exec(normalized)?.[1]?.trim();
    if (!hint || hint.length < 3) continue;
    const cleaned = hint.replace(/^(?:servi[cç]o|servico)\s+/i, "").trim();
    const finalHint = (cleaned.length >= 3 ? cleaned : hint).slice(0, 2000);
    return {
      service_hint: finalHint.slice(0, 255),
      description: finalHint,
    };
  }

  return null;
}

function extractDescriptionFreeform(text: string): string | undefined {
  if (isVagueEmissionPhrase(text)) return undefined;
  if (isDataRequestMessage(text)) return undefined;
  if (isTomadorCityPhrase(text)) return undefined;

  const normalized = normalizeText(text);
  if (parseCompetenceIsoFromLabel(normalized)) return undefined;

  const servicePrefix = parseServicePrefixText(text);
  if (servicePrefix?.description) return servicePrefix.description;

  const labeled = text.match(/(?:descri[cç][aã]o|servi[cç]o)\s*[:\-]\s*(.+)$/i);
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 2000);

  if (/\b(?:servi[cç]o|servico)\b/i.test(text)) return undefined;

  if (text.length >= 8 && !GREETING_RE.test(text) && !EMISSION_INTENT_RE.test(text)) {
    if (!extractTomadorDocument(text) && !parseAmountCentsFromFreeformText(text)) {
      const candidate = text.slice(0, 2000);
      if (!isValidFiscalDescription(candidate)) return undefined;
      return candidate;
    }
  }
  return undefined;
}

function draftToTomadorAddressLabeled(draft: ChannelDraft): ChannelLabeledFields {
  return {
    tomador_street: draft.tomador_address?.street,
    tomador_number: draft.tomador_address?.number,
    tomador_district: draft.tomador_address?.district,
    tomador_zip: draft.tomador_address?.zip_code,
    tomador_city_ibge: draft.tomador_address?.ibge_code ?? draft.tomador_address?.city_name,
  };
}

function patchTomadorAddressFromContext(
  normalized: string,
  draft: ChannelDraft,
): Partial<ChannelDraft> {
  const addressMissing = getMissingTomadorAddressFields(draftToTomadorAddressLabeled(draft));
  if (addressMissing.length === 0) return {};

  const addr = { ...(draft.tomador_address ?? {}) };
  let touched = false;

  if (addressMissing.includes("tomador_city_ibge")) {
    const ibge = resolveMunicipioIbgeFromText(normalized);
    if (ibge) {
      addr.ibge_code = ibge;
      delete addr.city_name;
      touched = true;
    } else if (normalized.length >= 3 && !parseAmountCentsFromFreeformText(normalized)) {
      applyTomadorCityToAddress(addr, normalized);
      touched = true;
    }
  }

  if (addressMissing.includes("tomador_zip")) {
    const zip = onlyDigits(normalized);
    if (zip.length === 8) {
      addr.zip_code = zip;
      touched = true;
    }
  }

  if (addressMissing.includes("tomador_number") && /^\d+[a-z0-9-]*$/i.test(normalized)) {
    addr.number = normalized.slice(0, 32);
    touched = true;
  }

  if (addressMissing.includes("tomador_street") && addressMissing.length === 1) {
    addr.street = normalized.slice(0, 255);
    touched = true;
  }

  if (addressMissing.includes("tomador_district") && addressMissing.length === 1) {
    addr.district = normalized.slice(0, 120);
    touched = true;
  }

  return touched ? { tomador_address: addr } : {};
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
    const addressPatch = patchTomadorAddressFromContext(normalized, draft);
    if (Object.keys(addressPatch).length > 0) return addressPatch;

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
  if (missing.length !== 1) {
    const addressMissing = getMissingTomadorAddressFields(draftToTomadorAddressLabeled(draft));
    if (missing.length === 0 && addressMissing.length === 1) {
      const value = normalizeText(text);
      if (!value || value.includes(":")) return null;
      if (GREETING_RE.test(value) || EMISSION_INTENT_RE.test(value)) return null;

      const addr = { ...(draft.tomador_address ?? {}) };
      switch (addressMissing[0]!) {
        case "tomador_street":
          addr.street = value.slice(0, 255);
          break;
        case "tomador_number":
          if (!/^\d+[a-z0-9-]*$/i.test(value)) return null;
          addr.number = value.slice(0, 32);
          break;
        case "tomador_district":
          addr.district = value.slice(0, 120);
          break;
        case "tomador_zip": {
          const zip = onlyDigits(value);
          if (zip.length !== 8) return null;
          addr.zip_code = zip;
          break;
        }
        case "tomador_city_ibge":
          applyTomadorCityToAddress(addr, value);
          break;
        default:
          return null;
      }
      return { tomador_address: addr };
    }
    return null;
  }

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
      if (isVagueEmissionPhrase(value) || isDataRequestMessage(value) || parseCompetenceIsoFromLabel(value)) {
        return null;
      }
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
