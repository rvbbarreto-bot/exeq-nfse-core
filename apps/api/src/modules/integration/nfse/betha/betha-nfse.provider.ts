import type { ExeqNfseV1 } from "@exeq/shared";

import type {

  INfseProvider,

  NfseCancelResult,

  NfseConsultResult,

  NfseProviderCredentials,

  NfseSubmitResult,

} from "../nfse-provider.types.js";

import { mapExeqNfseV1ToBethaDps } from "./betha-dps.adapter.js";

import { BethaDpsSoapClient } from "./betha-dps-soap.client.js";

import { buildBethaDpsUnsignedXml, extractBethaDpsListaMensagem } from "./betha-dps-xml.builder.js";

import { mapExeqNfseV1ToBethaRps } from "./betha-nfse.adapter.js";

import { buildBethaRpsXml } from "./betha-xml.builder.js";

import { loadPfxMaterial } from "./betha-pfx.utils.js";

import { signBethaDpsXml } from "./betha-xml-signer.js";

import { BethaSoapClient } from "./betha-soap.client.js";

import { env } from "../../../../config/env.js";



type BethaCreds = Extract<NfseProviderCredentials, { kind: "betha" }>;



function assertBethaCredentials(

  credentials: NfseProviderCredentials,

): asserts credentials is BethaCreds {

  if (credentials.kind !== "betha") {

    throw new Error("BETHA_CREDENTIALS_REQUIRED");

  }

}



function requireCertificateFields(credentials: BethaCreds): BethaCreds {

  if (!credentials.certificatePfxBase64 || !credentials.certificatePassword) {

    throw new Error("BETHA_CERTIFICATE_MISSING");

  }

  if (!credentials.wsdlUrl) {

    throw new Error("BETHA_WSDL_MISSING");

  }

  return credentials;

}



function isDpsMode(credentials: BethaCreds): boolean {

  return credentials.integrationMode === "dps";

}



function mapDpsConsultStatus(

  status: string,

  numero_nfse?: string,

  codigo_verificacao?: string,

  raw?: unknown,

): NfseConsultResult {

  const n = status.toLowerCase();

  if (n.includes("processado com sucesso")) {

    return {

      status: "authorized",

      numero_nfse,

      codigo_verificacao,

      raw,

    };

  }

  if (n.includes("processado com erro") || n.includes("rejeit")) {
    const body = typeof raw === "string" ? raw : String(raw ?? "");
    const msg = extractBethaDpsListaMensagem(body);
    return {
      status: "rejected",
      erros: [
        {
          codigo: msg?.codigo ?? "BETHA_DPS",
          mensagem: msg?.mensagem ?? status,
        },
      ],
      raw,
    };
  }

  return { status: "processing", raw };

}



/**

 * Provedor Betha — RPS (legado) ou DPS (Nota Nacional / Atibaia 2026).

 */

export class BethaNfseProvider implements INfseProvider {

  readonly kind = "betha" as const;



  async submit(

    externalRef: string,

    payload: ExeqNfseV1,

    credentials: NfseProviderCredentials,

  ): Promise<NfseSubmitResult> {

    assertBethaCredentials(credentials);

    const creds = requireCertificateFields(credentials);



    if (isDpsMode(creds)) {

      const dpsPayload = mapExeqNfseV1ToBethaDps(payload, externalRef, {

        tpAmb: creds.tpAmb ?? 2,

        defaultNbs: env.BETHA_DEFAULT_NBS,

      });

      const unsigned = buildBethaDpsUnsignedXml(dpsPayload);

      const material = loadPfxMaterial(creds.certificatePfxBase64!, creds.certificatePassword!);

      const signedDps = signBethaDpsXml(unsigned, material);

      const client = new BethaDpsSoapClient({

        wsdlUrl: creds.wsdlUrl!,

        wsUrl: creds.wsUrl,

        certificatePfxBase64: creds.certificatePfxBase64!,

        certificatePassword: creds.certificatePassword!,

      });

      const { protocolo, raw } = await client.recepcionarDps(signedDps);

      return {

        externalRef: protocolo,

        status: "processing",

        raw: { protocolo, response: raw, mode: "dps" },

      };

    }



    const client = new BethaSoapClient({

      wsdlUrl: creds.wsdlUrl!,

      wsdlConsultarUrl: creds.wsdlConsultarUrl,

      certificatePfxBase64: creds.certificatePfxBase64!,

      certificatePassword: creds.certificatePassword!,

    });

    const rps = mapExeqNfseV1ToBethaRps(payload, externalRef);

    const xmlRps = buildBethaRpsXml(rps);

    const { protocolo, raw } = await client.recepcionarLoteRps(xmlRps);

    return {

      externalRef: protocolo || externalRef,

      status: "processing",

      raw: { protocolo, response: raw, mode: "rps" },

    };

  }



  async consult(

    externalRef: string,

    credentials: NfseProviderCredentials,

  ): Promise<NfseConsultResult> {

    assertBethaCredentials(credentials);

    const creds = requireCertificateFields(credentials);



    if (isDpsMode(creds)) {

      if (!creds.ibgeCode || !creds.prestadorCnpj) {

        throw new Error("BETHA_DPS_CONSULT_CONTEXT_MISSING");

      }

      const client = new BethaDpsSoapClient({

        wsdlUrl: creds.wsdlUrl!,

        wsUrl: creds.wsUrl,

        certificatePfxBase64: creds.certificatePfxBase64!,

        certificatePassword: creds.certificatePassword!,

      });

      const { status, numero_nfse, codigo_verificacao, raw } = await client.consultarStatusDps({

        tpAmb: creds.tpAmb ?? 2,

        codigoIbge: creds.ibgeCode,

        cpfCnpjPrestador: creds.prestadorCnpj,

        protocolo: externalRef,

      });

      return mapDpsConsultStatus(status, numero_nfse, codigo_verificacao, raw);

    }



    const client = new BethaSoapClient({

      wsdlUrl: creds.wsdlUrl!,

      wsdlConsultarUrl: creds.wsdlConsultarUrl,

      certificatePfxBase64: creds.certificatePfxBase64!,

      certificatePassword: creds.certificatePassword!,

    });

    const { status, raw } = await client.consultarLoteRps(externalRef);

    if (/autoriz/i.test(status)) {

      return { status: "authorized", raw };

    }

    if (/rejeit|erro/i.test(status)) {

      return {

        status: "rejected",

        erros: [{ codigo: "BETHA", mensagem: status }],

        raw,

      };

    }

    return { status: "processing", raw };

  }



  async cancel(

    externalRef: string,

    justificativa: string,

    credentials: NfseProviderCredentials,

  ): Promise<NfseCancelResult> {

    assertBethaCredentials(credentials);

    void externalRef;

    void justificativa;

    void credentials;

    throw new Error("BETHA_CANCEL_NOT_IMPLEMENTED");

  }

}


