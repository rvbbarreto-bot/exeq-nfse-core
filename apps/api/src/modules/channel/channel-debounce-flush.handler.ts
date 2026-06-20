import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { withTenant } from "../../db/client.js";
import { getRedisConnection } from "../../workers/queues.js";
import {
  buildDebounceKeys,
  consolidateBufferedMessages,
  readAndClearDebounceBuffer,
  registerChannelDebounceFlushHandler,
} from "./channel-inbound-debounce.service.js";
import { sendChannelEvolutionText } from "./channel-evolution-outbound.service.js";
import { processChannelInbound } from "./process-channel-inbound.use-case.js";

async function flushChannelDebounceBatch(
  redis: Redis,
  tenantId: string,
  phoneE164: string,
  executionTs: string,
): Promise<void> {
  const keys = buildDebounceKeys(tenantId, phoneE164);
  const currentTs = await redis.get(keys.lastTs);
  if (currentTs !== executionTs) return;

  const items = await readAndClearDebounceBuffer(redis, keys);
  if (items.length === 0) return;

  const batch = consolidateBufferedMessages(phoneE164, items);
  batch.skip_inbound_log = true;
  const correlationId = randomUUID();

  const result = await withTenant(tenantId, (db) =>
    processChannelInbound(db, tenantId, batch, correlationId),
  );

  const reply = (result.reply_text ?? "").trim();
  if (!reply) return;

  const sent = await sendChannelEvolutionText({
    phone_e164: phoneE164,
    text: reply,
  });

  if (!sent.ok) {
    console.error(
      `[channel-debounce] Evolution send failed phone=${phoneE164} reason=${sent.reason}`,
    );
  }
}

export function startChannelDebounceFlushHandler(): void {
  registerChannelDebounceFlushHandler(async ({ tenantId, phoneE164, executionTs }) => {
    await flushChannelDebounceBatch(getRedisConnection(), tenantId, phoneE164, executionTs);
  });
}
