import type { ChannelDraft } from "./channel.js";
import {
  type ChannelMessageIntent,
  type ParsedChannelMessage,
  parseServicePrefixText,
  parseChannelMessageText,
} from "./channel-message-parser.js";

export type ConsolidatedChannelParseResult = {
  /** Patch acumulado de todas as linhas com dados fiscais. */
  mergedPatch: Partial<ChannelDraft>;
  /** Intents detectados (ordem das linhas). */
  intents: ChannelMessageIntent[];
  hasConfirm: boolean;
  hasCancel: boolean;
  hasHelp: boolean;
  hasRepeatLast: boolean;
  /** Linhas puramente sociais (saudação / intenção sem dados). */
  socialOnly: boolean;
  /** Último intent não-inform útil (ex.: emission_intent). */
  trailingSocialIntent: ChannelMessageIntent | null;
  lineCount: number;
};

const SOCIAL_INTENTS = new Set<ChannelMessageIntent>([
  "greeting",
  "emission_intent",
  "unknown",
]);

function mergeDraft(
  base: ChannelDraft | undefined,
  patch: Partial<ChannelDraft>,
): ChannelDraft {
  return { ...(base ?? {}), ...patch };
}

/**
 * M0.3 — Parse consolidado pós-debounce.
 * Split por \\n; cada linha alimenta o draft acumulado; nunca trata bloco multi-linha como saudação única.
 */
export function parseConsolidatedChannelMessages(
  text: string,
  ctx?: { currentDraft?: ChannelDraft; repeatOfferPending?: boolean },
): ConsolidatedChannelParseResult {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      mergedPatch: {},
      intents: ["unknown"],
      hasConfirm: false,
      hasCancel: false,
      hasHelp: false,
      hasRepeatLast: false,
      socialOnly: true,
      trailingSocialIntent: "unknown",
      lineCount: 0,
    };
  }

  if (lines.length === 1) {
    const parsed = parseChannelMessageText(lines[0]!, ctx);
    return fromSingleParsed(parsed, 1);
  }

  let rollingDraft = ctx?.currentDraft ?? {};
  const mergedPatch: Partial<ChannelDraft> = {};
  const intents: ChannelMessageIntent[] = [];
  let hasConfirm = false;
  let hasCancel = false;
  let hasHelp = false;
  let hasRepeatLast = false;
  let dataLines = 0;
  let trailingSocialIntent: ChannelMessageIntent | null = null;

  for (const line of lines) {
    const parsed = parseChannelMessageText(line, {
      currentDraft: mergeDraft(rollingDraft, mergedPatch),
      repeatOfferPending: ctx?.repeatOfferPending,
    });
    intents.push(parsed.intent);

    if (parsed.intent === "confirm") hasConfirm = true;
    if (parsed.intent === "cancel") hasCancel = true;
    if (parsed.intent === "help") hasHelp = true;
    if (parsed.intent === "repeat_last") hasRepeatLast = true;

    if (parsed.intent === "inform" && Object.keys(parsed.patch).length > 0) {
      Object.assign(mergedPatch, parsed.patch);
      rollingDraft = mergeDraft(rollingDraft, parsed.patch);
      dataLines += 1;
      trailingSocialIntent = null;
    } else if (SOCIAL_INTENTS.has(parsed.intent)) {
      trailingSocialIntent = parsed.intent;
    } else if (parsed.intent === "emission_intent") {
      trailingSocialIntent = "emission_intent";
    }
  }

  if (!mergedPatch.service_hint) {
    for (const line of lines) {
      const serviceHint = parseServicePrefixText(line);
      if (serviceHint?.service_hint) {
        Object.assign(mergedPatch, serviceHint);
        rollingDraft = mergeDraft(rollingDraft, serviceHint);
        dataLines += 1;
        trailingSocialIntent = null;
        break;
      }
    }
  }

  const socialOnly = dataLines === 0 && !hasConfirm && !hasCancel && !hasHelp && !hasRepeatLast;

  return {
    mergedPatch,
    intents,
    hasConfirm,
    hasCancel,
    hasHelp,
    hasRepeatLast,
    socialOnly,
    trailingSocialIntent,
    lineCount: lines.length,
  };
}

function fromSingleParsed(
  parsed: ParsedChannelMessage,
  lineCount: number,
): ConsolidatedChannelParseResult {
  const hasData = parsed.intent === "inform" && Object.keys(parsed.patch).length > 0;
  return {
    mergedPatch: hasData ? parsed.patch : {},
    intents: [parsed.intent],
    hasConfirm: parsed.intent === "confirm",
    hasCancel: parsed.intent === "cancel",
    hasHelp: parsed.intent === "help",
    hasRepeatLast: parsed.intent === "repeat_last",
    socialOnly: SOCIAL_INTENTS.has(parsed.intent) || parsed.intent === "emission_intent",
    trailingSocialIntent:
      parsed.intent === "greeting" ||
      parsed.intent === "emission_intent" ||
      parsed.intent === "unknown"
        ? parsed.intent
        : null,
    lineCount,
  };
}
