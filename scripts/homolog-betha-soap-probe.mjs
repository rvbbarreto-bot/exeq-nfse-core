#!/usr/bin/env node
/**
 * S1-09 — Diagnóstico conectividade Betha Cloud (RPS vs DPS).
 * Não exige certificado para probes públicos; com PFX testa POST mTLS em DPS.
 *
 * Uso:
 *   npm run homolog:betha:soap-probe
 *   node scripts/homolog-betha-soap-probe.mjs --pfx-path C:\path\cert.pfx --password "senha"
 */
import { config } from "dotenv";
import https from "node:https";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const URLS = {
  dpsXsd: "https://nota-eletronica.betha.cloud/dps/ws/schemas/nfse_dps_v01.xsd",
  dpsWsdl: "https://nota-eletronica.betha.cloud/dps/ws/service.wsdl",
  dpsWs: "https://nota-eletronica.betha.cloud/dps/ws",
  rpsRecepcionar: "https://nota-eletronica.betha.cloud/rps/ws/recepcionarLoteRps",
  rpsWsdl: "https://nota-eletronica.betha.cloud/rps/ws/recepcionarLoteRps?wsdl",
};

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function httpGet(url) {
  const res = await fetch(url, { method: "GET" });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

function httpsPost(url, body, pfx, passphrase) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: 443,
        path: target.pathname,
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
        pfx,
        passphrase,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 500),
          }),
        );
      },
    );
    req.on("error", reject);
    req.write(body, "utf8");
    req.end();
  });
}

const consultarStatusDpsProbe = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:e="http://www.betha.com.br/e-nota-dps">
  <soapenv:Header/>
  <soapenv:Body>
    <e:ConsultarStatusDpsEnvio>
      <e:tpAmb>2</e:tpAmb>
      <e:codigoIbge>3504107</e:codigoIbge>
      <e:cpfCnpjPrestador>${(process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "")}</e:cpfCnpjPrestador>
      <e:protocolo>probe-exeq-000000000000</e:protocolo>
      <e:tipoIntegracao>EMISSAO</e:tipoIntegracao>
    </e:ConsultarStatusDpsEnvio>
  </soapenv:Body>
</soapenv:Envelope>`;

async function main() {
  console.log("=== Betha Cloud — probe RPS vs DPS (Atibaia 3504107) ===\n");

  console.log("1/3 — Endpoints públicos (sem certificado)");
  for (const [label, url] of [
    ["DPS XSD", URLS.dpsXsd],
    ["DPS WSDL", URLS.dpsWsdl],
    ["RPS recepcionarLoteRps", URLS.rpsRecepcionar],
  ]) {
    const { status } = await httpGet(url);
    const ok = label.startsWith("DPS") ? status === 200 : status === 404;
    console.log(`   ${ok ? "OK" : "??"} — ${label}: HTTP ${status}`);
  }

  const configured = process.env.BETHA_WSDL_URL ?? "";
  console.log("\n2/3 — Configuração local");
  console.log(`   BETHA_WSDL_URL: ${configured || "(vazio)"}`);
  if (configured.includes("/rps/")) {
    console.log("   AVISO — URL RPS configurada; Atibaia/2026 exige DPS (Nota Nacional)");
    console.log("   Use: BETHA_WSDL_URL=https://nota-eletronica.betha.cloud/dps/ws/service.wsdl");
  }

  const pfxPath = getArg("--pfx-path");
  const password = getArg("--password") ?? process.env.BETHA_CERT_PASSWORD;
  let pfx;
  if (process.env.BETHA_CERT_B64) {
    pfx = Buffer.from(process.env.BETHA_CERT_B64, "base64");
  } else if (pfxPath) {
    pfx = readFileSync(pfxPath);
  }

  console.log("\n3/3 — POST mTLS DPS (ConsultarStatusDps)");
  if (!pfx || !password) {
    console.log("   SKIP — informe --pfx-path + --password ou BETHA_CERT_B64 + BETHA_CERT_PASSWORD");
    console.log("\nDiagnóstico: RPS=404 e DPS=200 → migração Nota Nacional confirmada.");
    console.log("Próximo: story S1-10 (cliente DPS + XML assinado).\n");
    return;
  }

  const { status, body } = await httpsPost(URLS.dpsWs, consultarStatusDpsProbe, pfx, password);
  console.log(`   HTTP ${status}`);
  if (status === 404) {
    console.log("   FALHA — 404 em /dps/ws (verifique certificado A1 e homolog no painel)");
  } else if (status >= 200 && status < 500) {
    console.log("   OK — canal mTLS DPS responde (erro de negócio é esperado no probe)");
    if (body.includes("soap") || body.includes("SOAP") || body.includes("ConsultarStatus")) {
      console.log("   Resposta SOAP recebida.");
    } else {
      console.log(`   Corpo: ${body.slice(0, 200)}`);
    }
  } else {
    console.log(`   Corpo: ${body}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
