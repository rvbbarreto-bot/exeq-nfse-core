import { env } from "../../config/env.js";

export type ReceitaCaptureResult = {
  valorPrincipal: number;
  valorMulta: number;
  valorJuros: number;
  dataVencimento: string;
  linhaDigitavel: string;
  pixCopiaCola: string;
  pdfBytes: Buffer;
  complianceStatus: "pendente" | "aprovado" | "bloqueado" | "dispensado";
};

export type CaptureDasInput = {
  cnpj: string;
  competencia: string;
};

export type CaptureDarfInput = CaptureDasInput & {
  codigoReceita: string;
  periodoApuracao: string;
};

function vencimentoFromCompetencia(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m) return "2030-12-20";
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(20, lastDay)).padStart(2, "0")}`;
}

function buildMockCapture(
  kind: "DAS" | "DARF",
  input: { cnpj: string; competencia: string },
): ReceitaCaptureResult {
  const cnpj = input.cnpj.replace(/\D/g, "");
  const baseValor = kind === "DARF" ? 320 : 150;
  const valor = baseValor + (Number(cnpj.slice(-2) || "0") % 50);
  const prefix = kind === "DARF" ? "856" : "858";
  return {
    valorPrincipal: valor,
    valorMulta: 0,
    valorJuros: 0,
    dataVencimento: vencimentoFromCompetencia(input.competencia),
    linhaDigitavel: `${prefix}00000000${String(Math.round(valor * 100)).padStart(10, "0")}12340201234567890123456789012345`,
    pixCopiaCola: `00020126580014br.gov.bcb.pix0136mock-${kind.toLowerCase()}`,
    pdfBytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8"),
    complianceStatus: "aprovado",
  };
}

async function captureHttp(
  path: "/das/capture" | "/darf/capture",
  body: Record<string, unknown>,
): Promise<ReceitaCaptureResult> {
  const base = env.RECEITA_DAS_CAPTURE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("RECEITA_DAS_CAPTURE_URL_NOT_CONFIGURED");
  }
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    error?: string;
    valor_principal?: number;
    valor_multa?: number;
    valor_juros?: number;
    data_vencimento?: string;
    linha_digitavel?: string;
    pix_copia_cola?: string;
    pdf_base64?: string;
    compliance_status?: ReceitaCaptureResult["complianceStatus"];
  };
  if (!res.ok) {
    throw new Error(json.error ?? `RECEITA_HTTP_${res.status}`);
  }
  return {
    valorPrincipal: json.valor_principal ?? 0,
    valorMulta: json.valor_multa ?? 0,
    valorJuros: json.valor_juros ?? 0,
    dataVencimento: json.data_vencimento ?? vencimentoFromCompetencia(String(body.competencia)),
    linhaDigitavel: json.linha_digitavel ?? "",
    pixCopiaCola: json.pix_copia_cola ?? "",
    pdfBytes: Buffer.from(json.pdf_base64 ?? "", "base64"),
    complianceStatus: json.compliance_status ?? "aprovado",
  };
}

export async function captureDasReceita(input: CaptureDasInput): Promise<ReceitaCaptureResult> {
  if (env.RECEITA_DAS_MOCK || env.RECEITA_GATEWAY_PROVIDER === "mock") {
    return buildMockCapture("DAS", input);
  }
  return captureHttp("/das/capture", {
    cnpj: input.cnpj.replace(/\D/g, ""),
    competencia: input.competencia,
    tipo_guia: "DAS",
  });
}

export async function captureDarfReceita(input: CaptureDarfInput): Promise<ReceitaCaptureResult> {
  if (env.RECEITA_DAS_MOCK || env.RECEITA_GATEWAY_PROVIDER === "mock") {
    return buildMockCapture("DARF", input);
  }
  return captureHttp("/darf/capture", {
    cnpj: input.cnpj.replace(/\D/g, ""),
    competencia: input.competencia,
    tipo_guia: "DARF",
    codigo_receita: input.codigoReceita,
    periodo_apuracao: input.periodoApuracao,
  });
}
