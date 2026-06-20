import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { parseConsolidatedChannelMessages } from "@exeq/shared";
import { closeDb } from "../src/db/client.js";
import { getRedisConnection } from "../src/workers/queues.js";
import {
  buildDebounceKeys,
  consolidateBufferedMessages,
  flushDebounceBufferForTests,
} from "../src/modules/channel/channel-inbound-debounce.service.js";

describe("M0.2 debounce Redis — 5 mensagens → 1 batch consolidado", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("LRANGE flush produz texto único; parser extrai saudação + intenção + data", async () => {
    const redis = getRedisConnection();
    const tenantId = randomUUID();
    const phone = `+55116${String(Date.now()).slice(-8)}`;
    const lines = ["oi", "boa noite", "quero emitir nova nota", "com data para ontem", "R$ 100,00"];
    const keys = buildDebounceKeys(tenantId, phone);
    const executionTs = Date.now().toString();

    for (let i = 0; i < lines.length; i += 1) {
      await redis.rpush(
        keys.buffer,
        JSON.stringify({
          message_id: `m${i}-${Date.now()}`,
          text: lines[i],
          received_at: new Date().toISOString(),
        }),
      );
    }
    await redis.set(keys.lastTs, executionTs, "EX", 120);

    const batch = await flushDebounceBufferForTests(redis, tenantId, phone, executionTs);
    expect(batch).not.toBeNull();
    expect(batch!.text).toBe(lines.join("\n"));

    const direct = consolidateBufferedMessages(
      phone,
      lines.map((text, i) => ({
        message_id: `m${i}`,
        text,
        received_at: new Date().toISOString(),
      })),
    );
    expect(direct.text).toBe(batch!.text);

    const parsed = parseConsolidatedChannelMessages(batch!.text, {
      currentDraft: { conversation_flags: { greeted: false } },
    });
    expect(parsed.lineCount).toBe(5);
    expect(parsed.mergedPatch.competence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.mergedPatch.amount_cents).toBe(10000);
    expect(parsed.socialOnly).toBe(false);
  });

  it("flush ignorado quando last_ts mudou (nova mensagem resetou leader)", async () => {
    const redis = getRedisConnection();
    const tenantId = randomUUID();
    const phone = `+55115${String(Date.now()).slice(-8)}`;
    const keys = buildDebounceKeys(tenantId, phone);
    const staleTs = "111";
    const currentTs = "222";

    await redis.rpush(
      keys.buffer,
      JSON.stringify({ message_id: "x", text: "oi", received_at: new Date().toISOString() }),
    );
    await redis.set(keys.lastTs, currentTs, "EX", 120);

    const batch = await flushDebounceBufferForTests(redis, tenantId, phone, staleTs);
    expect(batch).toBeNull();

    await redis.del(keys.buffer, keys.lastTs);
  });
});
