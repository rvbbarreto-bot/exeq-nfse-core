import { describe, expect, it } from "vitest";
import {
  buildChannelStatusMessage,
  draftToEmitRequest,
  getMissingDraftFields,
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

  it("converte draft completo para emit request", () => {
    const emit = draftToEmitRequest(complete, "channel-idem-001");
    expect(emit.idempotency_key).toBe("channel-idem-001");
    expect(emit.amount_cents).toBe(100000);
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
