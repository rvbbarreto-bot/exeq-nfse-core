import { describe, expect, it } from "vitest";
import { consolidateBufferedMessages } from "../src/modules/channel/channel-inbound-debounce.service.js";

describe("channel-inbound-debounce", () => {
  it("consolida textos com quebra de linha (padrão Emissor NF)", () => {
    const batch = consolidateBufferedMessages("+5511999998888", [
      { message_id: "m1", text: "bom dia", received_at: "2026-01-01T00:00:00.000Z" },
      { message_id: "m2", text: "quero emitir uma nota", received_at: "2026-01-01T00:00:01.000Z" },
      { message_id: "m3", text: "R$ 1.200,00", received_at: "2026-01-01T00:00:02.000Z" },
    ]);

    expect(batch.text).toBe("bom dia\nquero emitir uma nota\nR$ 1.200,00");
    expect(batch.message_id).toBe("m3");
    expect(batch.phone_e164).toBe("+5511999998888");
  });

  it("prefere transcribed_text por mensagem", () => {
    const batch = consolidateBufferedMessages("+5511888777666", [
      {
        message_id: "a1",
        text: "",
        transcribed_text: "valor mil reais",
        received_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(batch.text).toBe("valor mil reais");
  });
});
