import type { ExeqNfseV1, NfseExternalStatus, NfseProviderError, NfseProviderKind } from "@exeq/shared";

export type NfseSubmitResult = {
  externalRef: string;
  status: NfseExternalStatus | string;
  raw: unknown;
};

export type NfseConsultResult = {
  status: NfseExternalStatus | string;
  numero_nfse?: string;
  codigo_verificacao?: string;
  erros?: NfseProviderError[];
  raw: unknown;
};

export type NfseCancelResult = {
  status: NfseExternalStatus | string;
  raw: unknown;
};

export type FocusNacionalCredentials = {
  kind: "focus_nacional";
  token: string;
};

export type BethaCredentials = {
  kind: "betha";
  integrationMode?: "rps" | "dps";
  ibgeCode?: string;
  prestadorCnpj?: string;
  tpAmb?: 1 | 2;
  certificatePfxBase64?: string;
  certificatePassword?: string;
  wsdlUrl?: string;
  wsUrl?: string;
  wsdlConsultarUrl?: string;
};

export type NfseProviderCredentials = FocusNacionalCredentials | BethaCredentials;

/**
 * Porta de integração NFS-e — implementações: Focus Nacional, Betha (SOAP), futuros provedores.
 */
export interface INfseProvider {
  readonly kind: NfseProviderKind;

  submit(
    externalRef: string,
    payload: ExeqNfseV1,
    credentials: NfseProviderCredentials,
  ): Promise<NfseSubmitResult>;

  consult(externalRef: string, credentials: NfseProviderCredentials): Promise<NfseConsultResult>;

  cancel(
    externalRef: string,
    justificativa: string,
    credentials: NfseProviderCredentials,
  ): Promise<NfseCancelResult>;
}
