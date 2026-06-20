import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpPaymentGatewayClient } from "../src/modules/integration/gateway/http-payment-gateway.client.js";

describe("HttpPaymentGatewayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("RS-HTTP-01: createCharge envia payload e retorna gateway_ref", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        gateway_ref: "gw-ext-001",
        payment_url: "https://sandbox.gateway.exeq.local/pay/gw-ext-001",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpPaymentGatewayClient();
    const result = await client.createCharge("test-key", {
      charge_id: "11111111-1111-1111-1111-111111111111",
      idempotency_key: "http-test-001",
      amount_cents: 5000,
      due_date: "2026-12-01",
      description: "HTTP gateway test",
    });

    expect(result.gateway_ref).toBe("gw-ext-001");
    expect(result.sandbox_payment_url).toBe(
      "https://sandbox.gateway.exeq.local/pay/gw-ext-001",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      external_id: "11111111-1111-1111-1111-111111111111",
      amount_cents: 5000,
    });
  });

  it("RS-HTTP-02: createCharge mapeia HTTP 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: "Valor inválido" }),
      }),
    );

    const client = new HttpPaymentGatewayClient();
    await expect(
      client.createCharge("test-key", {
        charge_id: "22222222-2222-2222-2222-222222222222",
        idempotency_key: "http-test-422",
        amount_cents: 0,
        due_date: "2026-12-01",
      }),
    ).rejects.toThrow(/GATEWAY_HTTP_422/);
  });

  it("RS-HTTP-03: cancelCharge propaga erro HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: "Cobrança não encontrada" }),
      }),
    );

    const client = new HttpPaymentGatewayClient();
    await expect(client.cancelCharge("test-key", "gw-missing")).rejects.toThrow(
      /GATEWAY_HTTP_404/,
    );
  });
});
