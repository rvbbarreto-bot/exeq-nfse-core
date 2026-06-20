import https from "node:https";
import { URL } from "node:url";
import {
  extractBethaDpsListaMensagem,
  extractXmlTag,
  wrapConsultarStatusDpsSoapEnvelope,
  wrapRecepcionarDpsSoapEnvelope,
} from "./betha-dps-xml.builder.js";
import { resolveBethaSoapEndpoint } from "./betha-soap.client.js";

export type BethaDpsSoapClientConfig = {
  wsdlUrl: string;
  wsUrl?: string;
  certificatePfxBase64: string;
  certificatePassword: string;
};

export type ConsultarStatusDpsParams = {
  tpAmb: 1 | 2;
  codigoIbge: string;
  cpfCnpjPrestador: string;
  protocolo: string;
};

export class BethaDpsSoapClient {
  private readonly endpoint: string;

  constructor(private readonly config: BethaDpsSoapClientConfig) {
    this.endpoint = config.wsUrl ?? resolveBethaSoapEndpoint(config.wsdlUrl);
  }

  private postSoap(soapXml: string): Promise<{ statusCode: number; body: string }> {
    const target = new URL(this.endpoint);
    const pfx = Buffer.from(this.config.certificatePfxBase64, "base64");

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: target.hostname,
          port: target.port || 443,
          path: `${target.pathname}${target.search}`,
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            SOAPAction: '""',
            "Content-Length": Buffer.byteLength(soapXml, "utf8"),
          },
          pfx,
          passphrase: this.config.certificatePassword,
          rejectUnauthorized: true,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", reject);
      req.write(soapXml, "utf8");
      req.end();
    });
  }

  async recepcionarDps(signedDpsXml: string): Promise<{ protocolo: string; raw: unknown }> {
    const soapXml = wrapRecepcionarDpsSoapEnvelope(signedDpsXml);
    const { statusCode, body } = await this.postSoap(soapXml);

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`BETHA_DPS_HTTP_${statusCode}:${body.slice(0, 500)}`);
    }

    const fault = extractXmlTag(body, "faultstring");
    if (fault) {
      throw new Error(`BETHA_DPS_FAULT:${fault}`);
    }

    const protocolo = extractXmlTag(body, "protocolo");
    if (!protocolo) {
      const msg = extractBethaDpsListaMensagem(body);
      if (msg?.codigo || msg?.mensagem) {
        throw new Error(
          `BETHA_DPS_${msg.codigo ?? "VALIDATION"}:${msg.mensagem ?? "rejeitado"}${msg.correcao ? ` (${msg.correcao})` : ""}`,
        );
      }
      throw new Error(`BETHA_DPS_NO_PROTOCOLO:${body.slice(0, 500)}`);
    }
    return { protocolo, raw: body };
  }

  async consultarStatusDps(
    params: ConsultarStatusDpsParams,
  ): Promise<{
    status: string;
    numero_nfse?: string;
    codigo_verificacao?: string;
    raw: unknown;
  }> {
    const soapXml = wrapConsultarStatusDpsSoapEnvelope(params);
    const { statusCode, body } = await this.postSoap(soapXml);

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`BETHA_DPS_HTTP_${statusCode}:${body.slice(0, 500)}`);
    }

    const status =
      extractXmlTag(body, "statusProcessamento") ??
      extractXmlTag(body, "status") ??
      "unknown";

    return {
      status,
      numero_nfse: extractXmlTag(body, "numeroNotaFiscal"),
      codigo_verificacao: extractXmlTag(body, "chaveAcesso"),
      raw: body,
    };
  }
}
