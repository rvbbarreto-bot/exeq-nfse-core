import { describe, expect, it } from "vitest";
import { coerceAddressRecord } from "./json.js";

describe("coerceAddressRecord", () => {
  it("retorna objeto quando address e valido", () => {
    expect(coerceAddressRecord({ ibge_code: "3504107", street: "Rua A" })).toEqual({
      ibge_code: "3504107",
      street: "Rua A",
    });
  });

  it("parseia string JSON escapada (double-encoding)", () => {
    const raw =
      '{"ibge_code":"3504107","street":"Rua Dona Sinha","number":"200","district":"Centro","zip_code":"12940000"}';
    expect(coerceAddressRecord(raw)?.ibge_code).toBe("3504107");
  });

  it("retorna undefined para vazio ou invalido", () => {
    expect(coerceAddressRecord({})).toBeUndefined();
    expect(coerceAddressRecord(null)).toBeUndefined();
    expect(coerceAddressRecord("not-json")).toBeUndefined();
  });
});
