import https from "node:https";
import { URL } from "node:url";

/**
 * Cliente SOAP Betha — TLS mútuo com certificado A1 (PFX).
 * Layout ABRASF completo e assinatura XMLDSig: evolução incremental (S1-09).
 */
export type BethaSoapClientConfig = {
  wsdlUrl: string;
  wsdlConsultarUrl?: string;
  certificatePfxBase64: string;
  certificatePassword: string;
};

export function resolveBethaSoapEndpoint(wsdlUrl: string): string {
  const url = new URL(wsdlUrl);
  url.search = "";
  const path = url.pathname;
  if (/\/service\.wsdl$/i.test(path)) {
    // DPS Nota Nacional: WSDL em .../dps/ws/service.wsdl → POST em .../dps/ws
    url.pathname = path.replace(/\/service\.wsdl$/i, "");
  } else if (/\.wsdl$/i.test(path)) {
    // RPS legado: .../recepcionarLoteRps?wsdl → POST em .../recepcionarLoteRps
    url.pathname = path.replace(/\.wsdl$/i, "");
  }
  return url.toString();
}

function wrapSoapEnvelope(innerXml: string, operation = "RecepcionarLoteRps"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation} xmlns="http://www.betha.com.br/e-nota">
      <xml>${innerXml.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</xml>
    </${operation}>
  </soap:Body>
</soap:Envelope>`;
}

function extractProtocolo(responseBody: string): string | undefined {
  const match =
    responseBody.match(/<Protocolo[^>]*>([^<]+)<\/Protocolo>/i) ??
    responseBody.match(/<protocolo[^>]*>([^<]+)<\/protocolo>/i);
  return match?.[1]?.trim();
}

export class BethaSoapClient {
  private readonly endpointRecepcionar: string;
  private readonly endpointConsultar: string;

  constructor(private readonly config: BethaSoapClientConfig) {
    this.endpointRecepcionar = resolveBethaSoapEndpoint(config.wsdlUrl);
    const consultWsdl =
      config.wsdlConsultarUrl ??
      config.wsdlUrl.replace("/recepcionarLoteRps", "/consultarLoteRps");
    this.endpointConsultar = resolveBethaSoapEndpoint(consultWsdl);
  }

  private postSoap(
    endpoint: string,
    soapXml: string,
  ): Promise<{ statusCode: number; body: string }> {
    const target = new URL(endpoint);
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

  async recepcionarLoteRps(xmlRps: string): Promise<{ protocolo: string; raw: unknown }> {
    const soapXml = wrapSoapEnvelope(xmlRps);
    const { statusCode, body } = await this.postSoap(this.endpointRecepcionar, soapXml);

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`BETHA_SOAP_HTTP_${statusCode}:${body.slice(0, 500)}`);
    }

    const fault = body.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i)?.[1];
    if (fault) {
      throw new Error(`BETHA_SOAP_FAULT:${fault}`);
    }

    const protocolo = extractProtocolo(body);
    if (!protocolo) {
      throw new Error(`BETHA_SOAP_NO_PROTOCOLO:${body.slice(0, 500)}`);
    }

    return { protocolo, raw: body };
  }

  async consultarLoteRps(protocolo: string): Promise<{ status: string; raw: unknown }> {
    const inner = `<ConsultarLoteRpsRequest><Protocolo>${protocolo}</Protocolo></ConsultarLoteRpsRequest>`;
    const soapXml = wrapSoapEnvelope(inner, "ConsultarLoteRps");
    const { statusCode, body } = await this.postSoap(this.endpointConsultar, soapXml);
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`BETHA_SOAP_HTTP_${statusCode}:${body.slice(0, 500)}`);
    }
    const status =
      body.match(/<Situacao[^>]*>([^<]+)<\/Situacao>/i)?.[1]?.trim() ??
      body.match(/<situacao[^>]*>([^<]+)<\/situacao>/i)?.[1]?.trim() ??
      "unknown";
    return { status, raw: body };
  }

  async consultarNfsePorRps(_rpsNumero: string, _serie: string): Promise<{ status: string; raw: unknown }> {
    throw new Error("BETHA_SOAP_NOT_IMPLEMENTED: consultarNfsePorRps");
  }

  async cancelarNfse(_xmlCancelamento: string): Promise<{ status: string; raw: unknown }> {
    throw new Error("BETHA_SOAP_NOT_IMPLEMENTED: cancelarNfse");
  }
}
