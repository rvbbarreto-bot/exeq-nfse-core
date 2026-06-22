import { describe, expect, it } from "vitest";
import {
  assertFactoryNfAmountCap,
  FACTORY_MAX_NF_AMOUNT_CENTS,
  FactoryNfAmountCapExceededError,
} from "../src/factory-nf-amount-cap.js";

describe("factory NF amount cap (PO)", () => {
  it("aceita até R$ 4,00", () => {
    expect(() => assertFactoryNfAmountCap(400)).not.toThrow();
    expect(() => assertFactoryNfAmountCap(100)).not.toThrow();
  });

  it("rejeita acima do teto", () => {
    expect(() => assertFactoryNfAmountCap(401)).toThrow(FactoryNfAmountCapExceededError);
    try {
      assertFactoryNfAmountCap(150000);
    } catch (err) {
      expect(err).toBeInstanceOf(FactoryNfAmountCapExceededError);
      expect((err as FactoryNfAmountCapExceededError).maxCents).toBe(FACTORY_MAX_NF_AMOUNT_CENTS);
    }
  });
});
