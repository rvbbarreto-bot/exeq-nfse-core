import type { NfseProviderKind } from "@exeq/shared";
import { env } from "../../../config/env.js";
import type { INfseProvider } from "./nfse-provider.types.js";
import { FocusNfseProvider } from "./focus/focus-nfse.provider.js";
import { BethaNfseProvider } from "./betha/betha-nfse.provider.js";
import { MockBethaNfseProvider } from "./betha/mock-betha-nfse.provider.js";

const providers = new Map<NfseProviderKind, INfseProvider>();
const overrides = new Map<NfseProviderKind, INfseProvider>();

function createProvider(kind: NfseProviderKind): INfseProvider {
  if (kind === "betha") {
    return env.BETHA_MOCK ? new MockBethaNfseProvider() : new BethaNfseProvider();
  }
  return new FocusNfseProvider();
}

export function getNfseProvider(kind: NfseProviderKind): INfseProvider {
  const override = overrides.get(kind);
  if (override) return override;

  let provider = providers.get(kind);
  if (!provider) {
    provider = createProvider(kind);
    providers.set(kind, provider);
  }
  return provider;
}

/** Injeta mock em testes (ex.: Betha ou Focus via provider dedicado). */
export function setNfseProvider(kind: NfseProviderKind, provider: INfseProvider | null): void {
  if (provider) {
    overrides.set(kind, provider);
  } else {
    overrides.delete(kind);
  }
}

export function resetNfseProviders(): void {
  providers.clear();
  overrides.clear();
}
