/**
 * Parser rotulado PT-BR — paridade Emissor NF V11A (gate conversacional).
 * Regras fiscais e emissão permanecem no Core API (ADR-007).
 */

export type ChannelLabeledFields = {
  tomador_name?: string;
  tomador_document?: string;
  amount_label?: string;
  service_type?: string;
  description?: string;
  competence_label?: string;
  service_code?: string;
  ibge_code?: string;
  tomador_email?: string;
  tomador_street?: string;
  tomador_number?: string;
  tomador_complement?: string;
  tomador_district?: string;
  tomador_city_ibge?: string;
  tomador_state?: string;
  tomador_zip?: string;
};

export const CHANNEL_V11A_REQUIRED: readonly (keyof ChannelLabeledFields)[] = [
  "tomador_name",
  "tomador_document",
  "amount_label",
  "description",
  "competence_label",
  "service_code",
  "ibge_code",
] as const;

const LABEL_MAP: { field: keyof ChannelLabeledFields; labels: string[] }[] = [
  { field: "tomador_name", labels: ["cliente", "nome do cliente", "tomador"] },
  { field: "tomador_document", labels: ["documento", "cpf/cnpj", "cpf cnpj", "cpf", "cnpj"] },
  { field: "amount_label", labels: ["valor", "valor do serviço", "valor do servico"] },
  { field: "service_type", labels: ["tipo de serviço", "tipo de servico"] },
  {
    field: "description",
    labels: ["descrição do serviço", "descricao do serviço", "descrição", "descricao"],
  },
  { field: "competence_label", labels: ["data da prestação", "data da prestacao", "data"] },
  {
    field: "service_code",
    labels: [
      "código do serviço",
      "codigo do serviço",
      "código do servico",
      "codigo do servico",
      "codigo servico",
      "servico",
      "serviço",
    ],
  },
  {
    field: "ibge_code",
    labels: [
      "código do município da prestação",
      "codigo do municipio da prestacao",
      "codigo municipio",
      "municipio",
      "município",
      "ibge",
    ],
  },
  { field: "tomador_email", labels: ["email do tomador", "e-mail do tomador"] },
  { field: "tomador_street", labels: ["logradouro do tomador"] },
  { field: "tomador_number", labels: ["número do tomador", "numero do tomador"] },
  { field: "tomador_complement", labels: ["complemento do tomador"] },
  { field: "tomador_district", labels: ["bairro do tomador"] },
  {
    field: "tomador_city_ibge",
    labels: ["código do município do tomador", "codigo do municipio do tomador"],
  },
  { field: "tomador_state", labels: ["uf do tomador"] },
  { field: "tomador_zip", labels: ["cep do tomador"] },
];

function normalizeLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrai campos rotulados linha a linha (formato PO: "Nome do cliente: X"). */
export function extractLabeledChannelFields(text: string): ChannelLabeledFields {
  const normalized = String(text || "").replace(/\r/g, "");
  const lines = normalized.split("\n");
  const result: ChannelLabeledFields = {};

  for (const line of lines) {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
    if (!match) continue;

    const label = normalizeLabel(match[1]!);
    const value = String(match[2] || "").trim();
    if (!value) continue;

    let item = LABEL_MAP.find((m) => m.labels.some((l) => normalizeLabel(l) === label));
    if (item?.field === "service_type" && /^\d[\d.]*$/.test(value.replace(/\s/g, ""))) {
      item = LABEL_MAP.find((m) => m.field === "service_code");
    }
    if (item) {
      result[item.field] = value;
    }
  }

  return result;
}

export function isValidTomadorName(name: string | undefined): boolean {
  const n = String(name || "").trim();
  if (!n || n.length < 3) return false;
  if (/^(teste|xxx|nome|nome do cliente|cliente)$/i.test(n)) return false;
  return true;
}

export function onlyDigits(value: string | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function parseAmountCentsFromLabel(value: string | undefined): number | undefined {
  const s = String(value ?? "").trim();
  if (!s) return undefined;

  const embedded = s.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/i);
  const candidate = embedded?.[1] ?? s;
  const stripped = candidate.replace(/[R$\s]/gi, "");

  if (/,\d{2}$/.test(stripped)) {
    const normalized = stripped.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }

  const br = stripped.match(/^(\d{1,6})[,.](\d{2})$/i);
  if (br) return Number(br[1]) * 100 + Number(br[2]);

  const normalized = stripped.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 100);

  return undefined;
}

export function parseCompetenceIsoFromLabel(
  value: string | undefined,
  referenceDate: Date = new Date(),
): string | undefined {
  const s = String(value ?? "").trim();
  if (!s) return undefined;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const brInText = s.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (brInText) return `${brInText[3]}-${brInText[2]}-${brInText[1]}`;

  if (/\bontem\b/i.test(s)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  if (/\bhoje\b/i.test(s)) {
    return referenceDate.toISOString().slice(0, 10);
  }

  return undefined;
}

export function normalizeServiceCode(code: string | undefined): string | undefined {
  const raw = String(code ?? "").trim();
  if (!raw) return undefined;
  return raw.replace(/\s/g, "");
}

export function normalizeIbge(code: string | undefined): string | undefined {
  const digits = onlyDigits(code);
  return digits.length === 7 ? digits : undefined;
}

export function getMissingV11aFields(fields: ChannelLabeledFields): (typeof CHANNEL_V11A_REQUIRED)[number][] {
  const missing: (typeof CHANNEL_V11A_REQUIRED)[number][] = [];

  for (const key of CHANNEL_V11A_REQUIRED) {
    const v = fields[key];
    if (key === "tomador_name") {
      if (!isValidTomadorName(v)) missing.push(key);
      continue;
    }
    if (key === "tomador_document") {
      const doc = onlyDigits(v);
      if (!(doc.length === 11 || doc.length === 14)) missing.push(key);
      continue;
    }
    if (key === "ibge_code") {
      if (!normalizeIbge(v)) missing.push(key);
      continue;
    }
    if (!v || String(v).trim() === "") missing.push(key);
  }

  return missing;
}

const MISSING_LABELS: Partial<Record<keyof ChannelLabeledFields, string>> = {
  tomador_name: "nome do cliente",
  tomador_document: "CPF ou CNPJ",
  amount_label: "valor do serviço",
  description: "descrição do serviço",
  competence_label: "data da prestação",
  service_code: "código do serviço",
  ibge_code: "cidade da prestação (nome da cidade, ex.: Atibaia)",
};

export function buildV11aMissingReply(
  contactName: string | undefined,
  missing: (typeof CHANNEL_V11A_REQUIRED)[number][],
): string {
  const saudacao = (contactName || "Cliente").trim();
  const lista = missing.map((f) => `* ${MISSING_LABELS[f] ?? f}.`).join("\n");
  return (
    `${saudacao}: Ainda faltam os seguintes dados para emitir a nota:\n\n` +
    `${lista}\n\n` +
    `Por favor, envie somente os dados faltantes.`
  );
}

export function buildV11aConfirmationReply(fields: ChannelLabeledFields): string {
  const servicoPadrao = fields.service_type?.trim() || "-";
  const linhas = [
    "Recebi os dados para emissão da nota:",
    "",
    `* Nome do cliente: ${fields.tomador_name ?? ""}`,
    `* Documento: ${fields.tomador_document ?? ""}`,
    `* Valor: ${fields.amount_label ?? ""}`,
    `* Descrição: ${fields.description ?? ""}`,
    `* Data da prestação: ${fields.competence_label ?? ""}`,
    `* Código do serviço: ${fields.service_code ?? ""}`,
    `* Cidade da prestação: ${fields.ibge_code ?? ""}`,
    `* Serviço padrão aplicado: ${servicoPadrao}`,
  ];

  if (fields.tomador_email?.trim()) linhas.push(`* Email do tomador: ${fields.tomador_email}`);
  if (fields.tomador_street?.trim()) linhas.push(`* Logradouro do tomador: ${fields.tomador_street}`);
  if (fields.tomador_number?.trim()) linhas.push(`* Número do tomador: ${fields.tomador_number}`);
  if (fields.tomador_complement?.trim()) {
    linhas.push(`* Complemento do tomador: ${fields.tomador_complement}`);
  }
  if (fields.tomador_district?.trim()) linhas.push(`* Bairro do tomador: ${fields.tomador_district}`);
  if (fields.tomador_city_ibge?.trim()) {
    linhas.push(`* Código do município do tomador: ${fields.tomador_city_ibge}`);
  }
  if (fields.tomador_state?.trim()) linhas.push(`* UF do tomador: ${fields.tomador_state}`);
  if (fields.tomador_zip?.trim()) linhas.push(`* CEP do tomador: ${fields.tomador_zip}`);

  linhas.push("", "Se estiver tudo certo, responda CONFIRMAR.");
  return linhas.join("\n");
}
