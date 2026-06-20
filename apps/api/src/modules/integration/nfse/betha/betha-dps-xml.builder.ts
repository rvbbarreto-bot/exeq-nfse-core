import type { BethaDpsPayload } from "./betha-dps.adapter.js";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tomadorTag(payload: BethaDpsPayload): string {
  const doc = payload.tomadorDocumento;
  const docTag = doc.length === 11 ? "CPF" : "CNPJ";
  return [
    "               <toma>",
    `                  <${docTag}>${esc(doc)}</${docTag}>`,
    `                  <xNome>${esc(payload.tomadorNome)}</xNome>`,
    "                  <end>",
    "                     <endNac>",
    `                        <cMun>${esc(payload.tomadorCMun)}</cMun>`,
    `                        <CEP>${esc(payload.tomadorCep)}</CEP>`,
    "                     </endNac>",
    `                     <xLgr>${esc(payload.tomadorLogradouro)}</xLgr>`,
    `                     <nro>${esc(payload.tomadorNumero)}</nro>`,
    `                     <xBairro>${esc(payload.tomadorBairro)}</xBairro>`,
    "                  </end>",
    `                  <fone>${esc(payload.tomadorFone)}</fone>`,
    `                  <email>${esc(payload.tomadorEmail)}</email>`,
    "               </toma>",
  ].join("\n");
}

/** Monta DPS unsigned (infDPS) — assinar antes do envio SOAP. */
export function buildBethaDpsUnsignedXml(payload: BethaDpsPayload): string {
  const tpRet = payload.issRetido ? 2 : 1;
  return [
    `<DPS versao="1.01">`,
    `            <infDPS id="${esc(payload.infDpsId)}">`,
    `               <tpAmb>${payload.tpAmb}</tpAmb>`,
    `               <dhEmi>${esc(payload.dhEmi)}</dhEmi>`,
    `               <verAplic>exeq-nfse-core_1.0</verAplic>`,
    `               <serie>${esc(payload.serie)}</serie>`,
    `               <nDPS>${esc(payload.nDps)}</nDPS>`,
    `               <dCompet>${esc(payload.dCompet)}</dCompet>`,
    `               <tpEmit>1</tpEmit>`,
    `               <cLocEmi>${esc(payload.cLocEmi)}</cLocEmi>`,
    "               <prest>",
    `                  <CNPJ>${esc(payload.prestadorCnpj)}</CNPJ>`,
    `                  <fone>${esc(payload.prestadorFone)}</fone>`,
    `                  <email>${esc(payload.prestadorEmail)}</email>`,
    "                  <regTrib>",
    `                     <opSimpNac>${payload.opSimpNac}</opSimpNac>`,
    `                     <regApTribSN>${payload.regApTribSN}</regApTribSN>`,
    "                     <regEspTrib>0</regEspTrib>",
    "                  </regTrib>",
    "               </prest>",
    tomadorTag(payload),
    "               <serv>",
    "                  <locPrest>",
    `                     <cLocPrestacao>${esc(payload.cLocPrestacao)}</cLocPrestacao>`,
    "                  </locPrest>",
    "                  <cServ>",
    `                     <cTribNac>${esc(payload.cTribNac)}</cTribNac>`,
    `                     <xDescServ>${esc(payload.xDescServ)}</xDescServ>`,
    `                     <cNBS>${esc(payload.cNbs)}</cNBS>`,
    "                  </cServ>",
    "               </serv>",
    "               <valores>",
    "                  <vServPrest>",
    `                     <vServ>${payload.vServ.toFixed(2)}</vServ>`,
    "                  </vServPrest>",
    "                  <trib>",
    "                     <tribMun>",
    "                        <tribISSQN>1</tribISSQN>",
    `                        <pAliq>${payload.pAliq.toFixed(2)}</pAliq>`,
    `                        <tpRetISSQN>${tpRet}</tpRetISSQN>`,
    "                     </tribMun>",
    "                     <totTrib>",
    "                        <pTotTrib>",
    `                           <pTotTribFed>${payload.pTotTribFed.toFixed(2)}</pTotTribFed>`,
    `                           <pTotTribEst>${payload.pTotTribEst.toFixed(2)}</pTotTribEst>`,
    `                           <pTotTribMun>${payload.pTotTribMun.toFixed(2)}</pTotTribMun>`,
    "                        </pTotTrib>",
    "                     </totTrib>",
    "                  </trib>",
    "               </valores>",
    "            </infDPS>",
    "         </DPS>",
  ].join("\n");
}

export function wrapRecepcionarDpsSoapEnvelope(dpsXml: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://www.betha.com.br/e-nota-dps" xmlns:xd="http://www.w3.org/2000/09/xmldsig#">',
    "  <soapenv:Header/>",
    "  <soapenv:Body>",
    "    <RecepcionarDpsEnvio>",
    `      ${dpsXml}`,
    "    </RecepcionarDpsEnvio>",
    "  </soapenv:Body>",
    "</soapenv:Envelope>",
  ].join("\n");
}

export function wrapConsultarStatusDpsSoapEnvelope(params: {
  tpAmb: 1 | 2;
  codigoIbge: string;
  cpfCnpjPrestador: string;
  protocolo: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:e="http://www.betha.com.br/e-nota-dps">',
    "  <soapenv:Header/>",
    "  <soapenv:Body>",
    "    <e:ConsultarStatusDpsEnvio>",
    `      <e:tpAmb>${params.tpAmb}</e:tpAmb>`,
    `      <e:codigoIbge>${params.codigoIbge}</e:codigoIbge>`,
    `      <e:cpfCnpjPrestador>${params.cpfCnpjPrestador.replace(/\D/g, "")}</e:cpfCnpjPrestador>`,
    `      <e:protocolo>${params.protocolo}</e:protocolo>`,
    "      <e:tipoIntegracao>EMISSAO</e:tipoIntegracao>",
    "    </e:ConsultarStatusDpsEnvio>",
    "  </soapenv:Body>",
    "</soapenv:Envelope>",
  ].join("\n");
}

export function extractXmlTag(body: string, tag: string): string | undefined {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([^<]*)</(?:[\\w-]+:)?${tag}>`, "i");
  return body.match(re)?.[1]?.trim();
}

/** Extrai primeira mensagem de listaMensagens (validação XSD/negócio). */
export function extractBethaDpsListaMensagem(body: string): {
  codigo?: string;
  mensagem?: string;
  correcao?: string;
} | undefined {
  const block = body.match(
    /<(?:[\w-]+:)?listaMensagens[\s\S]*?<\/(?:[\w-]+:)?listaMensagens>/i,
  )?.[0];
  if (!block) return undefined;
  const codigo = extractXmlTag(block, "codigo");
  const mensagem = extractXmlTag(block, "mensagem");
  const correcao = extractXmlTag(block, "correcao");
  if (!codigo && !mensagem) return undefined;
  return { codigo, mensagem, correcao };
}
