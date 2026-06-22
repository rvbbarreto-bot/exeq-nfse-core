import { describe, expect, it } from "vitest";
import { isChannelDraftReadyForConfirm } from "../src/channel.js";

describe("isChannelDraftReadyForConfirm — fiscal preview gate", () => {
  const baseDraft = {
    provider_id: "00000000-0000-4000-8000-000000000001",
    customer_id: "00000000-0000-4000-8000-000000000002",
    service_id: "00000000-0000-4000-8000-000000000003",
    ibge_code: "3504107",
    competence_date: "2026-06-01",
    amount_cents: 10000,
    tomador_name: "Cliente Teste",
    tomador_document: "39053344705",
    description: "Servico de consultoria",
    service_code: "1.01",
    tomador_address: {
      street: "Rua Exemplo",
      number: "100",
      district: "Centro",
      zip_code: "12940000",
      ibge_code: "3504107",
    },
  };

  it("bloqueia confirmação quando tax_preview_block ativo", () => {
    expect(
      isChannelDraftReadyForConfirm({
        ...baseDraft,
        conversation_flags: { tax_preview_block: "Regra ausente" },
      }),
    ).toBe(false);
  });

  it("permite confirmação com tax_preview_summary ok", () => {
    expect(
      isChannelDraftReadyForConfirm({
        ...baseDraft,
        conversation_flags: {
          tax_preview_summary: {
            engine: "iss_legacy",
            iss_amount_cents: 200,
            ready: true,
          },
        },
      }),
    ).toBe(true);
  });
});
