import {
  buildChannelCollectReply,
  buildContinuesListeningReply,
  buildGreetingReply,
  buildPendingReviewReply,
  buildServiceAmbiguityReply,
  buildShortGreetingAck,
  isConversationStarted,
  parseConsolidatedChannelMessages,
  parseServicePrefixText,
} from "@exeq/shared";
import type { ChannelDraft } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { env } from "../../config/env.js";
import {
  cloneRepeatableDraft,
  getChannelContact,
  recordChannelMessage,
  saveSuccessfulEmissionToContact,
  upsertChannelContact,
} from "./channel-contact.service.js";
import { resolveChannelEmissionDefaults } from "./channel-defaults.service.js";
import { resolveChannelDraftIds } from "./channel-draft-resolver.service.js";
import {
  collectChannelSessionDraft,
  createChannelSession,
  findActiveChannelSessionByPhone,
  getChannelSession,
  setChannelSessionPendingReview,
} from "./channel.service.js";
import { applyChannelFiscalPreviewGate } from "./channel-fiscal-preview.service.js";
import { confirmChannelSession } from "./confirm-channel-session.use-case.js";
import {
  extractFieldsWithLlm,
  fetchRecentConversationHistory,
  filterLlmDraftPatch,
  filterLlmTomadorPatch,
  llmOutputToRawDraftPatch,
  recordLlmLog,
  shouldAttemptLlmFallback,
  type LlmExtractionOutput,
} from "./llm-extraction.service.js";

export type ProcessChannelInboundInput = {
  phone_e164: string;
  message_id: string;
  text?: string;
  transcribed_text?: string;
  contact_name?: string;
  /** Flush debounce — inbound já gravado em channel_message_log (M0.1). */
  skip_inbound_log?: boolean;
};

export type ProcessChannelInboundResult = {
  session_id: string;
  status: string;
  reply_text: string;
  issue_id?: string;
  emitted: boolean;
};

async function mergeAndResolveDraft(
  db: Sql,
  tenantId: string,
  sessionId: string,
  patch: Parameters<typeof collectChannelSessionDraft>[3],
) {
  let session = await collectChannelSessionDraft(db, tenantId, sessionId, patch);
  const resolved = await resolveChannelDraftIds(db, tenantId, session.draft_payload);
  if (JSON.stringify(resolved) !== JSON.stringify(session.draft_payload)) {
    session = await collectChannelSessionDraft(db, tenantId, sessionId, resolved);
  }
  session = await applyChannelFiscalPreviewGate(db, tenantId, sessionId);
  return session;
}

function resolveInboundMessageText(input: ProcessChannelInboundInput): string {
  const transcribed = (input.transcribed_text ?? "").trim();
  if (transcribed) return transcribed;
  return (input.text ?? "").trim();
}

async function logExchange(
  db: Sql,
  tenantId: string,
  contactId: string | undefined,
  sessionId: string,
  inbound: ProcessChannelInboundInput,
  replyText: string,
) {
  const body = resolveInboundMessageText(inbound);
  if (body && !inbound.skip_inbound_log) {
    await recordChannelMessage(db, tenantId, {
      contact_id: contactId,
      session_id: sessionId,
      direction: "inbound",
      message_id: inbound.message_id,
      message_body: body.slice(0, 4000),
    });
  }
  if (replyText) {
    await recordChannelMessage(db, tenantId, {
      contact_id: contactId,
      session_id: sessionId,
      direction: "outbound",
      message_body: replyText.slice(0, 4000),
    });
  }
}

function collectReplyForSession(
  session: Awaited<ReturnType<typeof getChannelSession>>,
  replyOpts: { contact_name?: string },
): string {
  return buildChannelCollectReply(session.missing_fields, session.draft_payload, replyOpts);
}

function withConversationFlags(
  draft: ChannelDraft,
  patch: Partial<ChannelDraft["conversation_flags"]>,
): ChannelDraft["conversation_flags"] {
  return { ...draft.conversation_flags, ...patch };
}

function missingListAlreadySent(draft: ChannelDraft): boolean {
  return draft.conversation_flags?.missing_list_sent === true;
}

async function replyWithMissingFields(
  db: Sql,
  tenantId: string,
  sessionId: string,
  draft: ChannelDraft,
  replyOpts: { contact_name?: string },
  markSent: boolean,
): Promise<string> {
  if (markSent && !missingListAlreadySent(draft)) {
    await mergeAndResolveDraft(db, tenantId, sessionId, {
      conversation_flags: withConversationFlags(draft, {
        missing_list_sent: true,
        greeted: true,
      }),
    });
    const refreshed = await getChannelSession(db, tenantId, sessionId);
    return collectReplyForSession(refreshed, replyOpts);
  }
  const current = await getChannelSession(db, tenantId, sessionId);
  return collectReplyForSession(current, replyOpts);
}

function serviceAmbiguityReply(draft: ChannelDraft): string | null {
  const options = draft.conversation_flags?.service_ambiguous_options;
  if (!options?.length) return null;
  return buildServiceAmbiguityReply(options);
}

async function tryLlmExtractionFallback(
  db: Sql,
  tenantId: string,
  sessionId: string,
  input: ProcessChannelInboundInput,
  messageText: string,
  currentDraft: ChannelDraft,
  consolidated: ReturnType<typeof parseConsolidatedChannelMessages>,
): Promise<{
  consolidated: ReturnType<typeof parseConsolidatedChannelMessages>;
  llmOutput: LlmExtractionOutput | null;
  pendingReview: boolean;
}> {
  if (
    !shouldAttemptLlmFallback(messageText, Object.keys(consolidated.mergedPatch).length, {
      hasConfirm: consolidated.hasConfirm,
      hasCancel: consolidated.hasCancel,
      hasHelp: consolidated.hasHelp,
      socialOnly: consolidated.socialOnly,
      intents: consolidated.intents,
    })
  ) {
    return { consolidated, llmOutput: null, pendingReview: false };
  }

  try {
    const history = await fetchRecentConversationHistory(db, tenantId, sessionId);
    const llmInput = {
      consolidated_text: messageText,
      current_draft: currentDraft,
      conversation_history: history,
    };
    const llmOutput = await extractFieldsWithLlm(llmInput);
    await recordLlmLog(db, tenantId, sessionId, llmInput, llmOutput, {
      message_id: input.message_id,
    });

    const lowConfidence = llmOutput.confidence_score < env.LLM_CONFIDENCE_THRESHOLD;
    if (lowConfidence || llmOutput.ambiguous_fields.length > 0) {
      await setChannelSessionPendingReview(db, tenantId, sessionId);
      return { consolidated, llmOutput, pendingReview: true };
    }

    const llmPatch = filterLlmDraftPatch(llmOutputToRawDraftPatch(llmOutput), messageText);
    const next = { ...consolidated };

    if (llmOutput.intent === "confirm") next.hasConfirm = true;
    if (llmOutput.intent === "cancel") next.hasCancel = true;
    if (llmOutput.intent === "help") next.hasHelp = true;

    if (Object.keys(llmPatch).length > 0) {
      next.mergedPatch = { ...consolidated.mergedPatch, ...llmPatch };
      next.socialOnly = false;
    }

    return { consolidated: next, llmOutput, pendingReview: false };
  } catch (err) {
    console.error("[channel-llm] extraction failed:", err);
    return { consolidated, llmOutput: null, pendingReview: false };
  }
}

export async function processChannelInbound(
  db: Sql,
  tenantId: string,
  input: ProcessChannelInboundInput,
  correlationId: string,
): Promise<ProcessChannelInboundResult> {
  const messageText = resolveInboundMessageText(input);
  const contact = await upsertChannelContact(db, tenantId, {
    phone_e164: input.phone_e164,
    display_name: input.contact_name,
  });

  let session = await findActiveChannelSessionByPhone(db, tenantId, input.phone_e164);
  const storedContact = await getChannelContact(db, tenantId, input.phone_e164);
  const hasLastEmission = Boolean(storedContact?.last_successful_draft && storedContact.total_emissions > 0);
  const displayName = contact.display_name ?? input.contact_name;

  if (!session) {
    session = await createChannelSession(
      db,
      tenantId,
      {
        phone_e164: input.phone_e164,
        idempotency_key: `wa-${input.phone_e164.replace(/\D/g, "")}-${Date.now()}`,
      },
      correlationId,
    );
    const defaults = await resolveChannelEmissionDefaults(db, tenantId);
    session = await collectChannelSessionDraft(db, tenantId, session.id, {
      provider_id: defaults.provider_id,
      conversation_flags: hasLastEmission ? { repeat_offer_pending: true } : undefined,
    });
  }

  const replyOpts = { contact_name: displayName ?? undefined };

  if (!messageText) {
    const transcribedProvided = input.transcribed_text !== undefined;
    const textProvided = (input.text ?? "").trim().length > 0;
    const reply =
      transcribedProvided && !textProvided
        ? "Recebi sua mensagem de áudio, mas não consegui transcrever. Envie os dados em texto ou configure OPENAI_API_KEY no n8n."
        : "Não recebi texto na mensagem. Envie os dados da NFS-e em texto ou grave um áudio.";
    await logExchange(db, tenantId, contact.id, session.id, input, reply);
    return { session_id: session.id, status: session.status, reply_text: reply, emitted: false };
  }

  const currentDraft = (await getChannelSession(db, tenantId, session.id)).draft_payload;

  const finish = async (result: Omit<ProcessChannelInboundResult, "session_id">) => {
    await logExchange(db, tenantId, contact.id, session!.id, input, result.reply_text);
    return { session_id: session!.id, ...result };
  };

  const markGreeted = async () => {
    await mergeAndResolveDraft(db, tenantId, session!.id, {
      conversation_flags: {
        ...currentDraft.conversation_flags,
        greeted: true,
        repeat_offer_pending: currentDraft.conversation_flags?.repeat_offer_pending,
      },
    });
  };

  let consolidated = parseConsolidatedChannelMessages(messageText, {
    currentDraft,
    repeatOfferPending: currentDraft.conversation_flags?.repeat_offer_pending === true,
  });

  const llmAttempt = await tryLlmExtractionFallback(
    db,
    tenantId,
    session.id,
    input,
    messageText,
    currentDraft,
    consolidated,
  );
  consolidated = llmAttempt.consolidated;

  if (llmAttempt.pendingReview) {
    return finish({
      status: "pending_review",
      reply_text: buildPendingReviewReply(displayName ?? undefined),
      emitted: false,
    });
  }

  if (consolidated.hasHelp) {
    const reply = await replyWithMissingFields(
      db,
      tenantId,
      session.id,
      currentDraft,
      replyOpts,
      true,
    );
    return finish({ status: session.status, reply_text: reply, emitted: false });
  }

  if (consolidated.hasCancel) {
    return finish({
      status: session.status,
      reply_text: "Emissão cancelada. Envie uma nova mensagem quando quiser emitir outra NFS-e.",
      emitted: false,
    });
  }

  if (consolidated.hasRepeatLast && storedContact?.last_successful_draft) {
    const repeatPatch = cloneRepeatableDraft(storedContact.last_successful_draft);
    await mergeAndResolveDraft(db, tenantId, session.id, {
      ...repeatPatch,
      conversation_flags: withConversationFlags(currentDraft, {
        repeat_offer_pending: false,
        greeted: true,
        missing_list_sent: true,
      }),
    });
    const current = await getChannelSession(db, tenantId, session.id);
    return finish({
      status: current.status,
      reply_text:
        "Carreguei os dados da última NFS-e autorizada. Confira o resumo e ajuste o que precisar.\n\n" +
        collectReplyForSession(current, replyOpts),
      emitted: false,
    });
  }

  if (Object.keys(consolidated.mergedPatch).length > 0) {
    await mergeAndResolveDraft(db, tenantId, session.id, {
      ...consolidated.mergedPatch,
      conversation_flags: withConversationFlags(currentDraft, {
        repeat_offer_pending: false,
        greeted: true,
      }),
    });
    if (!consolidated.hasConfirm) {
      const current = await getChannelSession(db, tenantId, session.id);
      const ambiguity = serviceAmbiguityReply(current.draft_payload);
      if (ambiguity) {
        return finish({ status: current.status, reply_text: ambiguity, emitted: false });
      }
      const reply = await replyWithMissingFields(
        db,
        tenantId,
        session.id,
        current.draft_payload,
        replyOpts,
        !missingListAlreadySent(current.draft_payload),
      );
      return finish({ status: current.status, reply_text: reply, emitted: false });
    }
  }

  if (consolidated.hasConfirm) {
    const current = await getChannelSession(db, tenantId, session.id);
    if (current.status !== "ready_to_confirm") {
      if (!missingListAlreadySent(current.draft_payload)) {
        await mergeAndResolveDraft(db, tenantId, session.id, {
          conversation_flags: withConversationFlags(current.draft_payload, {
            missing_list_sent: true,
          }),
        });
        const refreshed = await getChannelSession(db, tenantId, session.id);
        return finish({
          status: refreshed.status,
          reply_text: collectReplyForSession(refreshed, replyOpts),
          emitted: false,
        });
      }
      return finish({
        status: current.status,
        reply_text: collectReplyForSession(current, replyOpts),
        emitted: false,
      });
    }

    const result = await confirmChannelSession(db, tenantId, session.id, correlationId);
    if (result.issue_id && !result.duplicate) {
      await saveSuccessfulEmissionToContact(
        db,
        tenantId,
        input.phone_e164,
        current.draft_payload,
        result.issue_id,
      );
    }

    return finish({
      status: result.status,
      reply_text:
        "Sua NFS-e foi enviada para processamento. Aguarde — avisaremos aqui quando houver resultado.",
      issue_id: result.issue_id,
      emitted: true,
    });
  }

  if (
    consolidated.socialOnly &&
    consolidated.trailingSocialIntent === "greeting" &&
    consolidated.intents.every((i) => i === "greeting")
  ) {
    if (isConversationStarted(currentDraft)) {
      const active = await getChannelSession(db, tenantId, session.id);
      if (active.missing_fields.length > 0) {
        const reply = missingListAlreadySent(active.draft_payload)
          ? buildContinuesListeningReply(displayName ?? undefined)
          : collectReplyForSession(active, replyOpts);
        return finish({ status: active.status, reply_text: reply, emitted: false });
      }
      return finish({
        status: session.status,
        reply_text: buildShortGreetingAck(displayName ?? undefined),
        emitted: false,
      });
    }

    await markGreeted();
    const reply = buildGreetingReply(displayName ?? undefined, hasLastEmission);
    if (hasLastEmission) {
      await mergeAndResolveDraft(db, tenantId, session.id, {
        conversation_flags: { repeat_offer_pending: true, greeted: true },
      });
    }
    return finish({ status: session.status, reply_text: reply, emitted: false });
  }

  if (
    consolidated.socialOnly &&
    consolidated.trailingSocialIntent === "emission_intent"
  ) {
    if (!currentDraft.conversation_flags?.greeted) {
      await markGreeted();
    }
    const reply = await replyWithMissingFields(
      db,
      tenantId,
      session.id,
      currentDraft,
      replyOpts,
      !missingListAlreadySent(currentDraft),
    );
    return finish({ status: session.status, reply_text: reply, emitted: false });
  }

  const current = await getChannelSession(db, tenantId, session.id);
  const hasPartialData =
    Object.keys(consolidated.mergedPatch).length > 0 ||
    Boolean(current.draft_payload.tomador_name) ||
    Boolean(current.draft_payload.amount_cents) ||
    Boolean(current.draft_payload.tomador_document);

  if (hasPartialData || isConversationStarted(current.draft_payload)) {
    const reply = await replyWithMissingFields(
      db,
      tenantId,
      session.id,
      current.draft_payload,
      replyOpts,
      !missingListAlreadySent(current.draft_payload),
    );
    return finish({ status: current.status, reply_text: reply, emitted: false });
  }

  if (!isConversationStarted(current.draft_payload)) {
    await markGreeted();
    return finish({
      status: current.status,
      reply_text: buildGreetingReply(displayName ?? undefined, hasLastEmission),
      emitted: false,
    });
  }

  const rescueHint = parseServicePrefixText(messageText);
  if (rescueHint?.service_hint) {
    await mergeAndResolveDraft(db, tenantId, session.id, {
      ...rescueHint,
      conversation_flags: withConversationFlags(current.draft_payload, {
        greeted: true,
        missing_list_sent: true,
      }),
    });
    const rescued = await getChannelSession(db, tenantId, session.id);
    const ambiguity = serviceAmbiguityReply(rescued.draft_payload);
    if (ambiguity) {
      return finish({ status: rescued.status, reply_text: ambiguity, emitted: false });
    }
    return finish({
      status: rescued.status,
      reply_text: collectReplyForSession(rescued, replyOpts),
      emitted: false,
    });
  }

  const unknownReply = await replyWithMissingFields(
    db,
    tenantId,
    session.id,
    current.draft_payload,
    replyOpts,
    !missingListAlreadySent(current.draft_payload),
  );

  return finish({
    status: current.status,
    reply_text: unknownReply,
    emitted: false,
  });
}
