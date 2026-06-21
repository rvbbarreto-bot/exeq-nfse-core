import { describe, expect, it } from "vitest";
import { parseConsolidatedChannelMessages } from "../src/channel-consolidated-parser.js";

describe("M0.3 parseConsolidatedChannelMessages", () => {
  it("extrai saudação + intenção + data relativa em bloco multi-linha", () => {
    const text = [
      "oi",
      "boa noite",
      "quero emitir nova nota",
      "com data para ontem",
      "consegue emitir hoje?",
    ].join("\n");

    const r = parseConsolidatedChannelMessages(text, {
      currentDraft: { conversation_flags: { greeted: false } },
    });

    expect(r.lineCount).toBe(5);
    expect(r.mergedPatch.competence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.socialOnly).toBe(false);
    expect(r.hasConfirm).toBe(false);
  });

  it("não trata bloco multi-linha só social como greeting único", () => {
    const text = ["oi", "boa noite", "quero emitir nova nota"].join("\n");
    const r = parseConsolidatedChannelMessages(text);

    expect(r.socialOnly).toBe(true);
    expect(r.trailingSocialIntent).toBe("emission_intent");
    expect(r.mergedPatch.amount_cents).toBeUndefined();
  });

  it("confirm em linha separada após dados", () => {
    const draft = {
      tomador_name: "João",
      tomador_document: "11444777000161",
      amount_cents: 100,
      description: "Consultoria",
      competence_date: "2026-06-01",
      service_code: "1.01",
      ibge_code: "3504107",
    };
    const r = parseConsolidatedChannelMessages("valor R$ 2,00\nCONFIRMAR", {
      currentDraft: draft,
    });

    expect(r.hasConfirm).toBe(true);
    expect(r.mergedPatch.amount_cents).toBe(200);
  });

  it("linha única mantém compatibilidade", () => {
    const r = parseConsolidatedChannelMessages("bom dia");
    expect(r.intents).toEqual(["greeting"]);
    expect(r.socialOnly).toBe(true);
  });

  it("consolida lote PO: valor, cidade e serviço natural", () => {
    const text = [
      "olá",
      "quero emitir mais uma nf",
      "quero uma nota no valor de 1.234,00",
      "cidade Atibaia",
      "serviço desenvolvimento de software",
    ].join("\n");

    const r = parseConsolidatedChannelMessages(text);
    expect(r.mergedPatch.amount_cents).toBe(123400);
    expect(r.mergedPatch.ibge_code).toBe("3504107");
    expect(r.mergedPatch.service_hint).toBe("desenvolvimento de software");
    expect(r.socialOnly).toBe(false);
  });

  it("recupera serviço em linha classificada como unknown", () => {
    const text = ["bom dia", "o serviço é serviço desenvolvimento de software"].join("\n");
    const r = parseConsolidatedChannelMessages(text);
    expect(r.mergedPatch.service_hint).toBe("desenvolvimento de software");
  });
});
