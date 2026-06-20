import type { NfseProviderKind } from "@exeq/shared";
import {
  mapFocusStatusToOperatorMessage,
  mapFocusHttpError,
  mapPrevalidateCodeToOperatorMessage,
} from "../focus/focus-error-mapper.js";
import type { OperatorMessage } from "../focus/focus-error-mapper.js";
import { mapBethaStatusToOperatorMessage } from "./betha/betha-error-mapper.js";

export type { OperatorMessage };
export { mapPrevalidateCodeToOperatorMessage };

export function mapProviderStatusToOperatorMessage(
  providerKind: NfseProviderKind,
  status: string,
): OperatorMessage {
  if (providerKind === "betha") {
    return mapBethaStatusToOperatorMessage(status);
  }
  return mapFocusStatusToOperatorMessage(status);
}

export function mapProviderHttpError(
  providerKind: NfseProviderKind,
  status: number,
  body?: unknown,
): OperatorMessage {
  if (providerKind === "betha") {
    return {
      code: `BETHA_HTTP_${status}`,
      title: "Erro na comunicacao Betha",
      detail: `Betha retornou HTTP ${status}. Verifique certificado e WSDL do municipio.`,
      action: "Revise certificado A1/A3 no vault e cadastro municipal.",
    };
  }
  return mapFocusHttpError(status, body);
}
