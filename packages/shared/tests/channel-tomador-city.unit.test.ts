import { describe, expect, it } from "vitest";
import { applyTomadorCityToAddress, parseConsolidatedChannelMessages } from "@exeq/shared";

describe("channel tomador address + city", () => {
  it("rotulo Cidade do tomador: Atibaia resolve IBGE piloto", () => {
    const r = parseConsolidatedChannelMessages(
      [
        "Logradouro do tomador: Rua Homolog",
        "Numero do tomador: 100",
        "Bairro do tomador: Centro",
        "CEP do tomador: 12940000",
        "Cidade do tomador: Atibaia",
      ].join("\n"),
    );

    expect(r.mergedPatch.tomador_address?.street).toBe("Rua Homolog");
    expect(r.mergedPatch.tomador_address?.number).toBe("100");
    expect(r.mergedPatch.tomador_address?.district).toBe("Centro");
    expect(r.mergedPatch.tomador_address?.zip_code).toBe("12940000");
    expect(r.mergedPatch.tomador_address?.ibge_code).toBe("3504107");
  });

  it("typo Tibaya resolve via alias piloto", () => {
    const addr: { ibge_code?: string; city_name?: string } = {};
    applyTomadorCityToAddress(addr, "Tibaya");
    expect(addr.ibge_code).toBe("3504107");
  });
});
