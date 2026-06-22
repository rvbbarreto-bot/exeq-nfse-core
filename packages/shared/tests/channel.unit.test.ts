import { describe, expect, it } from "vitest";
import {
  buildChannelStatusMessage,
  draftToEmitRequest,
  getMissingDraftFields,
  isChannelDraftReadyForConfirm,
  isDraftReady,
} from "../src/channel.js";

describe("channel draft", () => {
  const complete = {
    provider_id: "550e8400-e29b-41d4-a716-446655440001",
    customer_id: "550e8400-e29b-41d4-a716-446655440002",
    service_id: "550e8400-e29b-41d4-a716-446655440003",
    ibge_code: "3504107",
    competence_date: "2026-06-01",
    amount_cents: 100000,
  };

  it("detecta campos faltantes", () => {
    expect(getMissingDraftFields({ ibge_code: "3504107" }).length).toBeGreaterThan(0);
    expect(isDraftReady(complete)).toBe(true);
  });

  it("nao libera confirmacao sem V11A mesmo com customer_id", () => {
    expect(
      isChannelDraftReadyForConfirm({
        ...complete,
        tomador_name: undefined,
        tomador_document: undefined,
      }),
    ).toBe(false);
  });

  it("libera confirmacao com IDs e V11A completos", () => {
    expect(
      isChannelDraftReadyForConfirm({
        ...complete,
        tomador_name: "Empresa Exemplo Ltda",
        tomador_document: "11444777000161",
        description: "Consultoria",
        service_code: "1.01",
        tomador_address: {
          street: "Rua Exemplo",
          number: "100",
          district: "Centro",
          zip_code: "12940000",
          ibge_code: "3525102",
        },
      }),
    ).toBe(true);
  });

  it("converte draft completo para emit request com tomador", () => {
    const emit = draftToEmitRequest(
      {
        ...complete,
        tomador_name: "Empresa Exemplo Ltda",
        tomador_document: "11444777000161",
        tomador_address: {
          street: "Rua Exemplo",
          number: "100",
          district: "Centro",
          zip_code: "12940000",
          ibge_code: "3525102",
        },
      },
      "channel-idem-001",
    );
    expect(emit.idempotency_key).toBe("channel-idem-001");
    expect(emit.amount_cents).toBe(100000);
    expect(emit.tomador?.address.zip_code).toBe("12940000");
  });

  it("monta mensagem de notificacao autorizada (Focus)", () => {
    const msg = buildChannelStatusMessage("nf.authorized", {
      issue_id: "550e8400-e29b-41d4-a716-446655440099",
      focus_ref: "ref-123",
      nfse_provider_kind: "focus_nacional",
    });
    expect(msg).toContain("autorizada");
    expect(msg).toContain("Ref Focus");
    expect(msg).toContain("ref-123");
  });

  it("monta mensagem de notificacao autorizada (Betha)", () => {
    const msg = buildChannelStatusMessage("nf.authorized", {
      issue_id: "550e8400-e29b-41d4-a716-446655440099",
      focus_ref: "betha-mock-ref",
      nfse_provider_kind: "betha",
    });
    expect(msg).toContain("Ref Betha");
    expect(msg).toContain("betha-mock-ref");
  });
});
