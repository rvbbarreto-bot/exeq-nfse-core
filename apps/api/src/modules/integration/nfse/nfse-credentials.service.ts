import type { NfseProviderKind } from "@exeq/shared";
import type { Sql } from "../../../db/client.js";
import { env } from "../../../config/env.js";
import { getTenantSecret } from "../../platform/secret-vault.service.js";
import type { SecretKind } from "../../platform/secret-vault.service.js";
import type { NfseProviderCredentials } from "./nfse-provider.types.js";
import { resolveBethaWsdlUrl } from "./nfse-provider.resolver.js";

export type ResolveNfseCredentialsOptions = {
  prestadorCnpj?: string;
};

function resolveBethaIntegrationMode(wsdlUrl?: string): "rps" | "dps" {
  if (env.BETHA_INTEGRATION_MODE) return env.BETHA_INTEGRATION_MODE;
  if (wsdlUrl?.includes("/dps/")) return "dps";
  if (wsdlUrl?.includes("/rps/")) return "rps";
  return "dps";
}

export async function resolveNfseCredentials(
  db: Sql,
  tenantId: string,
  providerKind: NfseProviderKind,
  ibgeCode: string,
  opts?: ResolveNfseCredentialsOptions,
): Promise<NfseProviderCredentials> {
  if (providerKind === "focus_nacional") {
    const token = await getTenantSecret(db, tenantId, "focus_token");
    if (!token) throw new Error("FOCUS_TOKEN_MISSING");
    return { kind: "focus_nacional", token };
  }

  const certificatePfxBase64 = await getTenantSecret(db, tenantId, "betha_certificate" as SecretKind);
  const certificatePassword = await getTenantSecret(
    db,
    tenantId,
    "betha_certificate_password" as SecretKind,
  );
  const wsdlUrl = (await resolveBethaWsdlUrl(db, ibgeCode)) ?? env.BETHA_WSDL_URL;
  const integrationMode = resolveBethaIntegrationMode(wsdlUrl);
  const wsdlConsultarUrl =
    integrationMode === "rps"
      ? (env.BETHA_WSDL_CONSULTAR_URL ??
        (wsdlUrl?.includes("/recepcionarLoteRps")
          ? wsdlUrl.replace("/recepcionarLoteRps", "/consultarLoteRps")
          : undefined))
      : undefined;

  return {
    kind: "betha",
    integrationMode,
    ibgeCode,
    prestadorCnpj: opts?.prestadorCnpj?.replace(/\D/g, ""),
    tpAmb: env.BETHA_DPS_TP_AMB as 1 | 2,
    certificatePfxBase64: certificatePfxBase64 ?? undefined,
    certificatePassword: certificatePassword ?? undefined,
    wsdlUrl,
    wsUrl: env.BETHA_WS_URL,
    wsdlConsultarUrl,
  };
}
