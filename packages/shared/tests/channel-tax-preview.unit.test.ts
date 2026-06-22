import { describe, expect, it } from "vitest";
import {
  appendTaxPreviewToConfirmation,
  buildChannelTaxPreviewBlockedReply,
  buildChannelTaxPreviewSuffix,
} from "../src/channel-tax-preview.js";

describe("channel-tax-preview", () => {
  it("buildChannelTaxPreviewSuffix inclui ISS e IBS/CBS híbrido", () => {
    const text = buildChannelTaxPreviewSuffix({
      engine: "hybrid",
      iss_amount_cents: 200,
      ibs_amount_cents: 10,
      cbs_amount_cents: 90,
      ready: true,
    });
    expect(text).toContain("ISS: R$ 2,00");
    expect(text).toContain("IBS");
    expect(text).toContain("CBS");
  });

  it("appendTaxPreviewToConfirmation preserva CONFIRMAR", () => {
    const base = "Resumo\n\nSe estiver tudo certo, responda CONFIRMAR.";
    const out = appendTaxPreviewToConfirmation(base, {
      engine: "iss_legacy",
      iss_amount_cents: 300,
      ready: true,
    });
    expect(out).toContain("Prévia tributária");
    expect(out).toContain("CONFIRMAR");
  });

  it("buildChannelTaxPreviewBlockedReply orienta o cliente", () => {
    const msg = buildChannelTaxPreviewBlockedReply("Regra fiscal ausente.");
    expect(msg).toContain("contador");
    expect(msg).toContain("Regra fiscal ausente");
  });
});
