import { describe, expect, it } from "vitest";
import { buildSplitPaymentV1, splitPaymentV1Schema } from "../src/split-payment.js";

describe("split-payment v1", () => {
  it("iss_legacy retorna not_applicable", () => {
    const sp = buildSplitPaymentV1({
      engine: "iss_legacy",
      municipio_destino_ibge: "3504107",
      resolved_taxes: { iss: { rate: 0.02, amount_cents: 200 } },
    });
    expect(sp.status).toBe("not_applicable");
    expect(sp.allocations).toHaveLength(0);
    expect(splitPaymentV1Schema.parse(sp).version).toBe(1);
  });

  it("hybrid gera alocações ISS + IBS + CBS", () => {
    const sp = buildSplitPaymentV1({
      engine: "hybrid",
      municipio_destino_ibge: "3504107",
      resolved_taxes: {
        iss: { rate: 0.02, amount_cents: 200 },
        ibs: { rate: 0.001, amount_cents: 10 },
        cbs: { rate: 0.009, amount_cents: 90 },
      },
    });
    expect(sp.status).toBe("sandbox");
    expect(sp.total_cents).toBe(300);
    expect(sp.allocations.map((a) => a.tax_kind)).toEqual(["iss", "ibs", "cbs"]);
    expect(sp.allocations[0]!.ibge_code).toBe("3504107");
  });
});
