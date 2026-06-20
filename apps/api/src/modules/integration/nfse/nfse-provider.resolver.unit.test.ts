import { describe, expect, it } from "vitest";
import {
  applyNfseRoutingPolicy,
  resolveNfseProviderKindFromConfig,
} from "./nfse-provider.resolver.js";
import { ATIBAIA_IBGE } from "@exeq/shared";

describe("nfse-provider.resolver", () => {
  it("Atibaia → focus_nacional (Betha descartado)", () => {
    expect(
      resolveNfseProviderKindFromConfig(ATIBAIA_IBGE, "focus_nacional"),
    ).toBe("focus_nacional");
  });

  it("focus_only policy descarta betha da tabela", () => {
    expect(applyNfseRoutingPolicy("betha")).toBe("focus_nacional");
    expect(resolveNfseProviderKindFromConfig(ATIBAIA_IBGE, "betha")).toBe(
      "focus_nacional",
    );
  });

  it("Atibaia sem tabela → default focus_nacional", () => {
    expect(resolveNfseProviderKindFromConfig(ATIBAIA_IBGE, null)).toBe(
      "focus_nacional",
    );
  });

  it("outro município usa tabela quando presente", () => {
    expect(resolveNfseProviderKindFromConfig("3547809", "focus_nacional")).toBe(
      "focus_nacional",
    );
  });

  it("município desconhecido → default focus_nacional", () => {
    expect(resolveNfseProviderKindFromConfig("9999999", null)).toBe("focus_nacional");
  });
});

