import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import type { ProcessChannelInboundInput } from "./process-channel-inbound.use-case.js";

/** Comandos que não devem aguardar debounce (resposta imediata). */
const IMMEDIATE_COMMAND_RE =
  /^(confirmar|confirmo|ok|sim|pode emitir|pode gerar|autorizar|segue|pode prosseguir|cancelar|cancela|desistir|nao|não|ajuda|help|\?|como emitir)[\s.!]*$/i;

export type BufferedChannelMessage = {
  message_id: string;
  text?: string;
  transcribed_text?: string;
  contact_name?: string;
  received_at: string;
};

export type ChannelInboundDebounceEnqueueResult =
  | { action: "process_now"; batch: ProcessChannelInboundInput; message_count: number }
  | { action: "buffered"; debounce_seconds: number };

type FlushHandler = (input: {
  tenantId: string;
  phoneE164: string;
  executionTs: string;
}) => Promise<void>;

const pendingTimers = new Map<string, NodeJS.Timeout>();
let flushHandler: FlushHandler | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function phoneDigits(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}

export function buildDebounceKeys(tenantId: string, phoneE164: string) {
  const digits = phoneDigits(phoneE164) || "sem_numero";
  const prefix = `exeq:channel:debounce:${tenantId}:${digits}`;
  return {
    buffer: `${prefix}:buffer`,
    lastTs: `${prefix}:last_ts`,
  };
}

function resolveMessageText(item: BufferedChannelMessage): string {
  const transcribed = (item.transcribed_text ?? "").trim();
  if (transcribed) return transcribed;
  return (item.text ?? "").trim();
}

/** Consolida buffer Redis em um único inbound (textos unidos por \\n). */
export function consolidateBufferedMessages(
  phoneE164: string,
  items: BufferedChannelMessage[],
): ProcessChannelInboundInput {
  const ordered = items.filter(Boolean);
  const texts = ordered.map(resolveMessageText).filter((t) => t.length > 0);
  const last = ordered.at(-1) ?? {
    message_id: `wa-batch-${Date.now()}`,
    received_at: new Date().toISOString(),
  };

  let contactName = "";
  for (const item of ordered) {
    if (item.contact_name?.trim()) contactName = item.contact_name.trim();
  }

  const consolidatedText = texts.join("\n");
  const batch: ProcessChannelInboundInput = {
    phone_e164: phoneE164,
    message_id: last.message_id || `wa-batch-${Date.now()}`,
    text: consolidatedText,
    contact_name: contactName || undefined,
  };

  const lastTranscribed = (last.transcribed_text ?? "").trim();
  if (lastTranscribed && lastTranscribed === consolidatedText) {
    batch.transcribed_text = lastTranscribed;
  }

  return batch;
}

function serializeBuffered(input: ProcessChannelInboundInput): string {
  const payload: BufferedChannelMessage = {
    message_id: input.message_id,
    text: input.text,
    transcribed_text: input.transcribed_text,
    contact_name: input.contact_name,
    received_at: new Date().toISOString(),
  };
  return JSON.stringify(payload);
}

function parseBuffered(raw: string): BufferedChannelMessage | null {
  try {
    return JSON.parse(raw) as BufferedChannelMessage;
  } catch {
    const text = String(raw ?? "").trim();
    if (!text) return null;
    return {
      message_id: `wa-legacy-${Date.now()}`,
      text,
      received_at: new Date().toISOString(),
    };
  }
}

function isImmediateCommand(input: ProcessChannelInboundInput): boolean {
  const text = resolveMessageText({
    message_id: input.message_id,
    text: input.text,
    transcribed_text: input.transcribed_text,
    received_at: "",
  });
  return IMMEDIATE_COMMAND_RE.test(text);
}

export async function readAndClearDebounceBuffer(
  redis: Redis,
  keys: ReturnType<typeof buildDebounceKeys>,
): Promise<BufferedChannelMessage[]> {
  const raw = await redis.lrange(keys.buffer, 0, -1);
  await redis.del(keys.buffer, keys.lastTs);
  return raw.map(parseBuffered).filter((m): m is BufferedChannelMessage => m != null);
}

export function registerChannelDebounceFlushHandler(handler: FlushHandler): void {
  flushHandler = handler;
}

function scheduleAsyncFlush(
  tenantId: string,
  phoneE164: string,
  executionTs: string,
  debounceSeconds: number,
): void {
  const timerKey = `${tenantId}:${phoneDigits(phoneE164)}`;
  const existing = pendingTimers.get(timerKey);
  if (existing) clearTimeout(existing);

  pendingTimers.set(
    timerKey,
    setTimeout(() => {
      pendingTimers.delete(timerKey);
      void flushHandler?.({ tenantId, phoneE164, executionTs }).catch((err) => {
        console.error("[channel-debounce] flush failed:", err);
      });
    }, debounceSeconds * 1000),
  );
}

/**
 * Empilha mensagem no Redis e agenda flush assíncrono (sem bloquear HTTP).
 * Padrão Projeto_EmissaoNF — last_ts + buffer — sem sleep na request.
 */
export async function enqueueChannelInboundDebounce(
  redis: Redis,
  tenantId: string,
  inbound: ProcessChannelInboundInput,
): Promise<ChannelInboundDebounceEnqueueResult> {
  const debounceSeconds = env.CHANNEL_DEBOUNCE_SECONDS;
  if (debounceSeconds <= 0) {
    return { action: "process_now", batch: inbound, message_count: 1 };
  }

  const waitSeconds = Math.max(3, debounceSeconds);

  const keys = buildDebounceKeys(tenantId, inbound.phone_e164);
  const ttlSeconds = waitSeconds + 120;
  const executionTs = Date.now().toString();

  await redis.rpush(keys.buffer, serializeBuffered(inbound));

  if (isImmediateCommand(inbound)) {
    await redis.set(keys.lastTs, executionTs, "EX", ttlSeconds);
    const items = await readAndClearDebounceBuffer(redis, keys);
    return {
      action: "process_now",
      batch: consolidateBufferedMessages(inbound.phone_e164, items),
      message_count: items.length || 1,
    };
  }

  await redis.set(keys.lastTs, executionTs, "EX", ttlSeconds);
  scheduleAsyncFlush(tenantId, inbound.phone_e164, executionTs, waitSeconds);

  return { action: "buffered", debounce_seconds: waitSeconds };
}

/** Testes — simula passagem do debounce sem timer real. */
export async function flushDebounceBufferForTests(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
  executionTs: string,
): Promise<ProcessChannelInboundInput | null> {
  const keys = buildDebounceKeys(tenantId, phoneE164);
  const currentTs = await redis.get(keys.lastTs);
  if (currentTs !== executionTs) return null;
  const items = await readAndClearDebounceBuffer(redis, keys);
  if (items.length === 0) return null;
  return consolidateBufferedMessages(phoneE164, items);
}

export async function waitForDebounceMs(ms: number): Promise<void> {
  await sleep(ms);
}

export function newCorrelationId(): string {
  return randomUUID();
}
