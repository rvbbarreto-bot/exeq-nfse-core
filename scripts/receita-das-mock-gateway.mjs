#!/usr/bin/env node
/** Mock gateway Receita DAS/DARF — portado de cobranca-saas-api */
import http from "node:http";

const port = Number(process.env.RECEITA_MOCK_PORT || 19443);
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  "utf8",
).toString("base64");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function vencimentoFromCompetencia(competencia) {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m) return "2030-12-20";
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(20, lastDay)).padStart(2, "0")}`;
}

function buildCaptureResponse(kind, cnpj, competencia) {
  const baseValor = kind === "DARF" ? 320 : 150;
  const valor = baseValor + (Number(cnpj.slice(-2)) % 50);
  const prefix = kind === "DARF" ? "856" : "858";
  return {
    valor_principal: valor,
    valor_multa: 0,
    valor_juros: 0,
    data_vencimento: vencimentoFromCompetencia(competencia),
    linha_digitavel: `${prefix}00000000${String(Math.round(valor * 100)).padStart(10, "0")}12340201234567890123456789012345`,
    pix_copia_cola: `00020126580014br.gov.bcb.pix0136mock-homolog-${kind.toLowerCase()}`,
    pdf_base64: MINIMAL_PDF,
    compliance_status: "aprovado",
  };
}

async function handleCapture(req, res, expectedKind) {
  try {
    const parsed = JSON.parse(await readBody(req));
    if (parsed.tipo_guia !== expectedKind) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "tipo_guia_invalido" }));
      return;
    }
    if (!parsed.cnpj || !parsed.competencia) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "validation_error" }));
      return;
    }
    if (expectedKind === "DARF" && (!parsed.codigo_receita || !parsed.periodo_apuracao)) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "validation_error" }));
      return;
    }
    const response = buildCaptureResponse(
      expectedKind,
      String(parsed.cnpj).replace(/\D/g, ""),
      parsed.competencia,
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal_error", message: String(err) }));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "receita-fiscal-mock" }));
    return;
  }
  if (req.method === "POST" && req.url === "/das/capture") {
    await handleCapture(req, res, "DAS");
    return;
  }
  if (req.method === "POST" && req.url === "/darf/capture") {
    await handleCapture(req, res, "DARF");
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[receita-fiscal-mock] http://127.0.0.1:${port}`);
});
