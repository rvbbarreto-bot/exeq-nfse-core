import { describe, expect, it, afterEach } from "vitest";
import { getNfseProvider, setNfseProvider, resetNfseProviders } from "./nfse-provider.factory.js";
import { MockBethaNfseProvider } from "./betha/mock-betha-nfse.provider.js";
import { FocusNfseProvider } from "./focus/focus-nfse.provider.js";

describe("nfse-provider.factory", () => {
  afterEach(() => {
    resetNfseProviders();
  });

  it("retorna FocusNfseProvider para focus_nacional", () => {
    const p = getNfseProvider("focus_nacional");
    expect(p).toBeInstanceOf(FocusNfseProvider);
    expect(p.kind).toBe("focus_nacional");
  });

  it("permite override de provider em testes", () => {
    const mock = new MockBethaNfseProvider();
    setNfseProvider("betha", mock);
    expect(getNfseProvider("betha")).toBe(mock);
  });
});
