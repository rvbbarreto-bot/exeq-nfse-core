import type { ExeqNfseV1 } from "@exeq/shared";
import { getFocusClient } from "../../focus/focus-client.js";
import { mapExeqNfseV1ToFocusNfsen } from "../../focus/focus-nfsen.adapter.js";
import type {
  INfseProvider,
  NfseCancelResult,
  NfseConsultResult,
  NfseProviderCredentials,
  NfseSubmitResult,
} from "../nfse-provider.types.js";
import { mapProviderStatusToExternal } from "../nfse-status.mapper.js";

function assertFocusCredentials(
  credentials: NfseProviderCredentials,
): asserts credentials is Extract<NfseProviderCredentials, { kind: "focus_nacional" }> {
  if (credentials.kind !== "focus_nacional" || !credentials.token) {
    throw new Error("FOCUS_TOKEN_MISSING");
  }
}

/** Adapta integração Focus `/v2/nfsen` para INfseProvider. */
export class FocusNfseProvider implements INfseProvider {
  readonly kind = "focus_nacional" as const;

  async submit(
    externalRef: string,
    payload: ExeqNfseV1,
    credentials: NfseProviderCredentials,
  ): Promise<NfseSubmitResult> {
    assertFocusCredentials(credentials);
    const focusPayload = mapExeqNfseV1ToFocusNfsen(payload);
    const response = await getFocusClient().submitNfsen(
      credentials.token,
      externalRef,
      focusPayload,
    );
    return {
      externalRef,
      status: mapProviderStatusToExternal(this.kind, response.status),
      raw: response.raw,
    };
  }

  async consult(
    externalRef: string,
    credentials: NfseProviderCredentials,
  ): Promise<NfseConsultResult> {
    assertFocusCredentials(credentials);
    const response = await getFocusClient().consultNfsen(credentials.token, externalRef);
    return {
      status: mapProviderStatusToExternal(this.kind, response.status),
      numero_nfse: response.numero_nfse,
      codigo_verificacao: response.codigo_verificacao,
      erros: response.erros,
      raw: response.raw,
    };
  }

  async cancel(
    externalRef: string,
    justificativa: string,
    credentials: NfseProviderCredentials,
  ): Promise<NfseCancelResult> {
    assertFocusCredentials(credentials);
    const response = await getFocusClient().cancelNfsen(
      credentials.token,
      externalRef,
      justificativa,
    );
    return {
      status: mapProviderStatusToExternal(this.kind, response.status),
      raw: response.raw,
    };
  }
}
