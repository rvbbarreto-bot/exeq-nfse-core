import { describe, expect, it } from "vitest";
import {
  buildChannelCollectReply,
  parseChannelMessageText,
} from "../src/channel-message-parser.js";

describe("channel-message-parser", () => {
  it("detecta confirmação", () => {
    expect(parseChannelMessageText("confirmar").intent).toBe("confirm");
    expect(parseChannelMessageText("  pode emitir  ").intent).toBe("confirm");
  });

  it("extrai valor BR", () => {
    const r = parseChannelMessageText("R$ 1,02 serviço: teste");
    expect(r.intent).toBe("inform");
    expect(r.patch.amount_cents).toBe(102);
    expect(r.patch.description).toBe("teste");
  });

  it("extrai Atibaia", () => {
    const r = parseChannelMessageText("emitir para Atibaia R$ 1,00");
    expect(r.patch.ibge_code).toBe("3504107");
    expect(r.patch.amount_cents).toBe(100);
  });

  it("extrai campos rotulados em várias linhas", () => {
    const text = [
      "Documento: 52998224725",
      "Valor: R$ 1.200,00",
      "Descrição: Consultoria",
      "Data: 01/06/2026",
      "Código do serviço: 1.01",
      "Código do município da prestação: 3504107",
    ].join("\n");
    const r = parseChannelMessageText(text);
    expect(r.intent).toBe("inform");
    expect(r.patch.tomador_document).toBe("52998224725");
    expect(r.patch.amount_cents).toBe(120000);
    expect(r.patch.service_code).toBe("1.01");
    expect(r.patch.ibge_code).toBe("3504107");
  });

  it("monta resumo quando draft pronto", () => {
    const msg = buildChannelCollectReply([], {
      amount_cents: 100,
      description: "Consultoria",
      ibge_code: "3504107",
    });
    expect(msg).toContain("confirmar");
    expect(msg).toContain("R$ 1.00");
  });
});
