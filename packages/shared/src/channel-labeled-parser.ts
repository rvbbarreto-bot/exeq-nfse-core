/**
 * Parser rotulado PT-BR — paridade Emissor NF V11A (gate conversacional).
 * Regras fiscais e emissão permanecem no Core API (ADR-007).
 */

import { resolveMunicipioIbgeFromText } from "./pilot-municipios.js";

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

/** Endereço do tomador — obrigatório na confirmação/emissão (CEP × IBGE — evita E0240). */
export const CHANNEL_TOMADOR_ADDRESS_FIELDS = [
  "tomador_street",
  "tomador_number",
  "tomador_district",
  "tomador_zip",
  "tomador_city_ibge",
] as const satisfies readonly (keyof ChannelLabeledFields)[];

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
      "cidade da prestação",
      "cidade da prestacao",
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
    labels: [
      "código do município do tomador",
      "codigo do municipio do tomador",
      "codigo ibge municipio tomador",
      "codigo ibge do municipio do tomador",
      "cidade do tomador",
      "cidade tomador",
      "municipio do tomador",
      "município do tomador",
    ],
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

/** Valor em texto livre — prioriza rótulo "valor" e ignora CNPJ/CPF formatado na linha. */
export function parseAmountCentsFromFreeformText(text: string | undefined): number | undefined {
  const s = String(text ?? "").trim();
  if (!s) return undefined;

  const labeled = s.match(/\bvalor\s*[:\-]?\s*((?:r\$\s*)?\d[\d.,]*)/i);
  if (labeled?.[1]) {
    const fromLabel = parseAmountCentsFromLabel(labeled[1]);
    if (fromLabel != null && fromLabel > 0) return fromLabel;
  }

  const withoutDoc = s.replace(/\b[\d./-]{14,22}\b/g, " ");
  const fromLabel = parseAmountCentsFromLabel(withoutDoc);
  if (fromLabel != null && fromLabel > 0) return fromLabel;

  return parseColloquialAmountReaisPt(s);
}

const PT_CARDINAL: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

/** Valor coloquial PT-BR: "mil reais", "valor de mil", "2 mil". */
export function parseColloquialAmountReaisPt(text: string | undefined): number | undefined {
  const norm = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!norm) return undefined;

  const numMil = norm.match(/(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*mil(?:\s+reais)?/);
  if (numMil) {
    const reais = Number(numMil[1]!.replace(",", ".")) * 1000;
    if (Number.isFinite(reais) && reais > 0) return Math.round(reais * 100);
  }

  const wordMil = norm.match(/\b([a-z]+)\s+mil(?:\s+reais)?/);
  if (wordMil) {
    const word = wordMil[1]!;
    const n = PT_CARDINAL[word] ?? Number(word);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000 * 100);
  }

  if (/\bmil\s+reais\b/.test(norm) || /\bvalor\s+(?:de\s+)?mil\b/.test(norm) || norm === "mil") {
    return 100_000;
  }

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

  const norm = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const addDays = (days: number) => {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  if (/\bontem\b/.test(norm)) return addDays(-1);
  if (/\bhoje\b/.test(norm)) return referenceDate.toISOString().slice(0, 10);
  if (/\bamanha\b/.test(norm)) return addDays(1);

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

/** Cidade do tomador informada (IBGE ou nome — nunca exigir código técnico ao cliente). */
export function isTomadorCityProvided(value: string | undefined): boolean {
  if (normalizeIbge(value)) return true;
  const text = String(value ?? "").trim();
  if (text.length < 3) return false;
  return onlyDigits(text).length !== 7;
}

export function applyTomadorCityToAddress(
  address: { ibge_code?: string; city_name?: string },
  raw?: string,
): void {
  const text = String(raw ?? "").trim();
  if (!text) return;

  const ibge = normalizeIbge(text);
  if (ibge) {
    address.ibge_code = ibge;
    delete address.city_name;
    return;
  }

  const fromPilot = resolveMunicipioIbgeFromText(text);
  if (fromPilot) {
    address.ibge_code = fromPilot;
    delete address.city_name;
    return;
  }

  address.city_name = text.slice(0, 120);
  delete address.ibge_code;
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

export function getMissingTomadorAddressFields(
  fields: ChannelLabeledFields,
): (typeof CHANNEL_TOMADOR_ADDRESS_FIELDS)[number][] {
  const missing: (typeof CHANNEL_TOMADOR_ADDRESS_FIELDS)[number][] = [];
  for (const key of CHANNEL_TOMADOR_ADDRESS_FIELDS) {
    const v = fields[key];
    if (key === "tomador_zip") {
      if (onlyDigits(v).length !== 8) missing.push(key);
      continue;
    }
    if (key === "tomador_city_ibge") {
      if (!isTomadorCityProvided(v)) missing.push(key);
      continue;
    }
    if (!v || String(v).trim() === "") missing.push(key);
  }
  return missing;
}

const MISSING_LABELS: Partial<Record<keyof ChannelLabeledFields, string>> = {
  tomador_name: "nome do cliente",
  tomador_document: "CPF ou CNPJ",
  tomador_street: "logradouro do tomador",
  tomador_number: "numero do tomador",
  tomador_district: "bairro do tomador",
  tomador_zip: "CEP do tomador",
  tomador_city_ibge: "cidade do tomador (ex.: Atibaia)",
  amount_label: "valor do serviço",
  description: "descrição do serviço",
  competence_label: "data da prestação",
  service_code: "código do serviço",
  ibge_code: "cidade da prestação (nome da cidade, ex.: Atibaia)",
};

export function buildV11aMissingReply(
  contactName: string | undefined,
  missing: Array<
    (typeof CHANNEL_V11A_REQUIRED)[number] | (typeof CHANNEL_TOMADOR_ADDRESS_FIELDS)[number]
  >,
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

  linhas.push(
    "",
    "_Na emissão, nome e endereço do tomador vêm do cadastro master data vinculado ao documento._",
    "",
    "Se estiver tudo certo, responda CONFIRMAR.",
  );
  return linhas.join("\n");
}
