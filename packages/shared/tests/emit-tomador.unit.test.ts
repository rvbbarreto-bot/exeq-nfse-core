import { describe, expect, it } from "vitest";
import { mergeEmitTomadorIntoCustomer, isCompleteTomadorAddress } from "../src/emit-tomador.js";

describe("emit-tomador", () => {
  const customer = {
    document: "52998224725",
    name: "Cadastro Antigo",
    email: "old@test.com",
    address: { street: "Rua Velha", number: "1", district: "Centro", zip_code: "01001000", ibge_code: "3550308" },
  };

  it("mescla tomador inline sobre cadastro", () => {
    const merged = mergeEmitTomadorIntoCustomer(customer, {
      document: "11444777000161",
      name: "Tomador Novo",
      address: {
        street: "Rua Nova",
        number: "200",
        district: "Jardim",
        zip_code: "12942440",
        ibge_code: "3504107",
      },
    });
    expect(merged.document).toBe("11444777000161");
    expect(merged.name).toBe("Tomador Novo");
    expect(merged.address).toMatchObject({ zip_code: "12942440", ibge_code: "3504107" });
  });

  it("valida endereco completo", () => {
    expect(
      isCompleteTomadorAddress({
        street: "Rua A",
        number: "1",
        district: "Centro",
        zip_code: "12940000",
        ibge_code: "3504107",
      }),
    ).toBe(true);
    expect(isCompleteTomadorAddress({ street: "Rua A" })).toBe(false);
  });
});
