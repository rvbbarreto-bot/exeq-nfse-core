import { describe, expect, it } from "vitest";
import {
  buildContinuesListeningReply,
  buildGreetingReply,
  parseChannelMessageText,
  patchFromContextualMessage,
  patchSingleMissingField,
} from "../src/channel-message-parser.js";

describe("channel-conversation multi-mensagem", () => {
  it("saudação não vira descrição fiscal", () => {
    expect(parseChannelMessageText("bom dia").intent).toBe("greeting");
    expect(parseChannelMessageText("tudo certo?").intent).toBe("greeting");
    expect(parseChannelMessageText("bom dia").patch).toEqual({});
  });

  it("intenção de emissão", () => {
    expect(parseChannelMessageText("quer uma nota").intent).toBe("emission_intent");
    expect(parseChannelMessageText("quero emitir uma nf").intent).toBe("emission_intent");
  });

  it("acumula valor em mensagem separada", () => {
    const draft = { tomador_name: "João", tomador_document: "11444777000161" };
    const r = parseChannelMessageText("R$ 2,11", { currentDraft: draft });
    expect(r.intent).toBe("inform");
    expect(r.patch.amount_cents).toBe(211);
  });

  it("acumula valor com milhar BR", () => {
    const draft = { tomador_name: "João", tomador_document: "11444777000161" };
    const r = parseChannelMessageText("valor, 1.400,89", { currentDraft: draft });
    expect(r.intent).toBe("inform");
    expect(r.patch.amount_cents).toBe(140089);
  });

  it("acumula data relativa ontem", () => {
    const draft = {
      tomador_name: "João",
      tomador_document: "11444777000161",
      amount_cents: 140089,
    };
    const r = parseChannelMessageText("data emissão de ontem", { currentDraft: draft });
    expect(r.intent).toBe("inform");
    expect(r.patch.competence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("acumula documento do tomador em texto livre", () => {
    const draft = { tomador_name: "João", amount_cents: 100 };
    const r = parseChannelMessageText("para o tomador 11444777000161", { currentDraft: draft });
    expect(r.intent).toBe("inform");
    expect(r.patch.tomador_document).toBe("11444777000161");
  });

  it("resolve cidade pelo nome", () => {
    const draft = { tomador_name: "João", tomador_document: "11444777000161", amount_cents: 100 };
    const r = parseChannelMessageText("prestação em Atibaia", { currentDraft: draft });
    expect(r.intent).toBe("inform");
    expect(r.patch.ibge_code).toBe("3504107");
  });

  it("preenche único campo faltante sem rótulo", () => {
    const draft = {
      tomador_document: "54955991000195",
      amount_cents: 211,
      description: "Consultoria",
      competence_date: "2026-04-24",
      service_code: "01.07.01",
      ibge_code: "3505708",
    };
    const patch = patchSingleMissingField("MARIA BEATRIZ", draft);
    expect(patch?.tomador_name).toBe("MARIA BEATRIZ");
  });

  it("patchFromContextualMessage extrai múltiplos campos quando possível", () => {
    const draft = { conversation_flags: { greeted: true } };
    const patch = patchFromContextualMessage("R$ 1,00 em Atibaia", draft);
    expect(patch.amount_cents).toBe(100);
    expect(patch.ibge_code).toBe("3504107");
  });

  it("repeat_last com oferta pendente", () => {
    expect(
      parseChannelMessageText("sim, mesmos dados", { repeatOfferPending: true }).intent,
    ).toBe("repeat_last");
  });

  it("saudação após conversa iniciada não repete lista V11A", () => {
    const draft = { conversation_flags: { greeted: true, missing_list_sent: true } };
    expect(parseChannelMessageText("tudo bem?", { currentDraft: draft }).intent).toBe("greeting");
  });

  it("buildContinuesListeningReply não lista campos", () => {
    const msg = buildContinuesListeningReply("Maria");
    expect(msg).toContain("Maria");
    expect(msg).not.toMatch(/Ainda faltam/i);
  });

  it("saudação humanizada com histórico", () => {
    const msg = buildGreetingReply("João Silva", true);
    expect(msg).toContain("João");
    expect(msg).toContain("mesmos dados");
  });

  it("acumula serviço livre quando V11A já completo e falta service_id", () => {
    const draft = {
      tomador_name: "Empresa Alpha",
      tomador_document: "56004031000175",
      amount_cents: 123400,
      description: "Consultoria",
      competence_date: "2026-06-18",
      service_code: "1.01",
      ibge_code: "3504107",
      service_id: undefined,
    };
    const patch = patchFromContextualMessage("serviço desenvolvimento de software", draft);
    expect(patch.service_hint).toBe("desenvolvimento de software");
    expect(patch.description).toBe("desenvolvimento de software");
  });
});
