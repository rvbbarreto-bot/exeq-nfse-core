import type { ChannelDraft } from "@exeq/shared";
import { onlyDigits, parseCompetenceIsoFromLabel } from "@exeq/shared";
import { z } from "zod";
import type { Sql } from "../../db/client.js";
import { env } from "../../config/env.js";

export type LlmExtractionInput = {
  consolidated_text: string;
  current_draft: ChannelDraft;
  conversation_history: string[];
};

export type LlmExtractedFields = {
  tomador_nome?: string;
  tomador_cnpj?: string;
  valor_servico?: number;
  descricao_servico?: string;
  cidade?: string;
  data_competencia?: string;
  service_code_hint?: string;
};

export type LlmExtractionIntent =
  | "inform"
  | "confirm"
  | "cancel"
  | "greeting"
  | "help"
  | "unknown";

export type LlmExtractionOutput = {
  extracted_fields: LlmExtractedFields;
  missing_fields: string[];
  confidence_score: number;
  ambiguous_fields: string[];
  intent: LlmExtractionIntent;
  raw_response: string;
  model_used?: string;
  tokens_used?: number;
  latency_ms?: number;
};

const llmJsonSchema = z.object({
  tomador_nome: z.string().nullable().optional(),
  tomador_cnpj: z.string().nullable().optional(),
  valor_servico: z.number().nullable().optional(),
  descricao_servico: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  data_competencia: z.string().nullable().optional(),
  service_code_hint: z.string().nullable().optional(),
  missing_fields: z.array(z.string()).optional().default([]),
  confidence_score: z.number().min(0).max(1).optional().default(0),
  ambiguous_fields: z.array(z.string()).optional().default([]),
  intent: z
    .enum(["inform", "confirm", "cancel", "greeting", "help", "unknown"])
    .optional()
    .default("unknown"),
});

function buildSystemPrompt(input: LlmExtractionInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const history =
    input.conversation_history.length > 0
      ? input.conversation_history.map((m, i) => `${i + 1}. ${m}`).join("\n")
      : "(sem histórico)";

  return `Você é um extrator de dados fiscais para emissão de NFS-e no Brasil via WhatsApp.

CONTEXTO:
- Draft atual: ${JSON.stringify(input.current_draft)}
- Histórico: ${history}
- DATA_ATUAL: ${today}

Retorne APENAS JSON válido com este schema:
{
  "tomador_nome": string | null,
  "tomador_cnpj": string | null,
  "valor_servico": number | null,
  "descricao_servico": string | null,
  "cidade": string | null,
  "data_competencia": string | null,
  "service_code_hint": string | null,
  "missing_fields": string[],
  "confidence_score": number,
  "ambiguous_fields": string[],
  "intent": "inform" | "confirm" | "cancel" | "greeting" | "help" | "unknown"
}

REGRAS:
- NUNCA calcule alíquotas, CNAE, IBGE numérico ou retenções.
- tomador_cnpj: apenas dígitos (CPF 11 ou CNPJ 14).
- valor_servico: número decimal em reais (3500.00).
- cidade: nome bruto (ex: "Atibaia"), sem código IBGE.
- data_competencia: YYYY-MM-DD quando possível.
- service_code_hint: tipo de serviço em texto livre.
- NUNCA preencha tomador_nome ou tomador_cnpj se o usuário não informou documento (CPF/CNPJ) ou nome do tomador na conversa.
- NUNCA invente valor_servico, cidade, descricao_servico ou data_competencia — só extraia se o cliente mencionou explicitamente na conversa.
- Se o cliente só cumprimenta, pergunta quais dados enviar ou expressa intenção vaga de emitir, retorne intent "help" e campos null.
- Não invente dados não mencionados.`;
}

/** Tomador só entra no draft se o usuário mencionou documento ou rótulo tomador/cliente. */
export function tomadorExplicitInText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/\b[\d./-]{14,22}\b/.test(normalized)) return true;
  if (/\b(\d{11}|\d{14})\b/.test(normalized)) return true;
  return /(?:tomador|cliente|documento|cpf|cnpj)\s*[:\-]/i.test(normalized);
}

export function filterLlmTomadorPatch(
  patch: Partial<ChannelDraft>,
  sourceText: string,
): Partial<ChannelDraft> {
  return filterLlmDraftPatch(patch, sourceText);
}

function amountExplicitInText(text: string): boolean {
  return /\b(valor|r\$|\d+[,.]\d{2}|\d+\s*(reais|real))\b/i.test(text);
}

function cityExplicitInText(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/\b(cidade|municipio|município|ibge)\b/i.test(normalized)) return true;
  return /\b(atibaia|bragan[cç]a|mairi[póo]ra)\b/i.test(normalized);
}

function descriptionExplicitInText(text: string): boolean {
  if (/^emitir\s+(uma\s+)?no?ts?\s*$/im.test(text.trim())) return false;
  return /(?:descri[cç][aã]o|servi[cç]o|servico)\s*[:\-]/i.test(text);
}

/** Remove campos inferidos pelo LLM que não aparecem no texto do cliente. */
export function filterLlmDraftPatch(
  patch: Partial<ChannelDraft>,
  sourceText: string,
): Partial<ChannelDraft> {
  const next = { ...patch };

  if (!tomadorExplicitInText(sourceText)) {
    delete next.tomador_name;
    delete next.tomador_document;
  }

  if (next.amount_cents != null && !amountExplicitInText(sourceText)) {
    delete next.amount_cents;
  }

  if ((next.ibge_code || next.city_hint) && !cityExplicitInText(sourceText)) {
    delete next.ibge_code;
    delete next.city_hint;
  }

  if (next.description && !descriptionExplicitInText(sourceText)) {
    delete next.description;
  }

  if (next.service_hint && !descriptionExplicitInText(sourceText) && !/\bservi[cç]o\b/i.test(sourceText)) {
    delete next.service_hint;
  }

  return next;
}

function parseLlmJson(raw: string): z.infer<typeof llmJsonSchema> {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  const slice =
    jsonStart >= 0 && jsonEnd > jsonStart ? trimmed.slice(jsonStart, jsonEnd + 1) : trimmed;
  return llmJsonSchema.parse(JSON.parse(slice));
}

async function callOpenAiChat(
  systemPrompt: string,
  userText: string,
  opts?: { model?: string; timeoutMs?: number },
): Promise<{ content: string; model: string; tokens?: number; latencyMs: number }> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = opts?.model ?? env.LLM_EXTRACTION_MODEL;
  const timeoutMs = opts?.timeoutMs ?? env.LLM_TIMEOUT_MS;
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OPENAI_HTTP_${res.status}:${errBody.slice(0, 200)}`);
    }

    const body = (await res.json()) as {
      model?: string;
      usage?: { total_tokens?: number };
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");

    return {
      content,
      model: body.model ?? model,
      tokens: body.usage?.total_tokens,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function extractFieldsWithLlm(
  input: LlmExtractionInput,
  opts?: { model?: string; timeoutMs?: number },
): Promise<LlmExtractionOutput> {
  const systemPrompt = buildSystemPrompt(input);
  let lastError: unknown;
  let rawResponse = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { content, model, tokens, latencyMs } = await callOpenAiChat(
        systemPrompt,
        input.consolidated_text,
        opts,
      );
      rawResponse = content;
      const parsed = parseLlmJson(content);

      const extracted: LlmExtractedFields = {};
      if (parsed.tomador_nome) extracted.tomador_nome = parsed.tomador_nome.trim();
      if (parsed.tomador_cnpj) {
        const digits = onlyDigits(parsed.tomador_cnpj);
        if (digits.length === 11 || digits.length === 14) extracted.tomador_cnpj = digits;
      }
      if (parsed.valor_servico != null && parsed.valor_servico > 0) {
        extracted.valor_servico = parsed.valor_servico;
      }
      if (parsed.descricao_servico) {
        extracted.descricao_servico = parsed.descricao_servico.trim().slice(0, 2000);
      }
      if (parsed.cidade) extracted.cidade = parsed.cidade.trim();
      if (parsed.data_competencia) extracted.data_competencia = parsed.data_competencia.trim();
      if (parsed.service_code_hint) {
        extracted.service_code_hint = parsed.service_code_hint.trim();
      }

      return {
        extracted_fields: extracted,
        missing_fields: parsed.missing_fields ?? [],
        confidence_score: parsed.confidence_score ?? 0,
        ambiguous_fields: parsed.ambiguous_fields ?? [],
        intent: parsed.intent ?? "unknown",
        raw_response: rawResponse,
        model_used: model,
        tokens_used: tokens,
        latency_ms: latencyMs,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("LLM_EXTRACTION_FAILED");
}

export function llmOutputToRawDraftPatch(output: LlmExtractionOutput): Partial<ChannelDraft> {
  const patch: Partial<ChannelDraft> = {};
  const f = output.extracted_fields;

  if (f.tomador_nome) patch.tomador_name = f.tomador_nome.slice(0, 255);
  if (f.tomador_cnpj) patch.tomador_document = f.tomador_cnpj;
  if (f.valor_servico != null && f.valor_servico > 0) {
    patch.amount_cents = Math.round(f.valor_servico * 100);
  }
  if (f.descricao_servico) patch.description = f.descricao_servico;
  if (f.cidade) patch.city_hint = f.cidade;
  if (f.service_code_hint) patch.service_hint = f.service_code_hint;

  if (f.data_competencia) {
    const iso =
      /^\d{4}-\d{2}-\d{2}$/.test(f.data_competencia)
        ? f.data_competencia
        : parseCompetenceIsoFromLabel(f.data_competencia);
    if (iso) patch.competence_date = iso;
  }

  return patch;
}

export async function recordLlmLog(
  db: Sql,
  tenantId: string,
  sessionId: string,
  input: LlmExtractionInput,
  output: LlmExtractionOutput,
  meta?: { message_id?: string; was_fallback?: boolean },
): Promise<void> {
  await db`
    INSERT INTO exeq_core.channel_llm_log (
      tenant_id,
      session_id,
      message_id,
      input_text,
      current_draft_snapshot,
      extracted_fields,
      missing_fields,
      confidence_score,
      ambiguous_fields,
      detected_intent,
      raw_llm_response,
      model_used,
      tokens_used,
      latency_ms,
      was_fallback
    ) VALUES (
      ${tenantId}::uuid,
      ${sessionId}::uuid,
      ${meta?.message_id ?? null},
      ${input.consolidated_text.slice(0, 8000)},
      ${db.json(input.current_draft)},
      ${db.json(output.extracted_fields)},
      ${output.missing_fields},
      ${output.confidence_score},
      ${output.ambiguous_fields},
      ${output.intent},
      ${output.raw_response.slice(0, 16000)},
      ${output.model_used ?? null},
      ${output.tokens_used ?? null},
      ${output.latency_ms ?? null},
      ${meta?.was_fallback ?? false}
    )
  `;
}

export function shouldAttemptLlmFallback(
  messageText: string,
  mergedPatchKeys: number,
  flags: {
    hasConfirm: boolean;
    hasCancel: boolean;
    hasHelp: boolean;
    socialOnly: boolean;
    intents: string[];
  },
): boolean {
  if (!env.CHANNEL_LLM_FALLBACK_ENABLED || !env.OPENAI_API_KEY) return false;
  if (/\b(quais|que)\s+(os\s+)?dados|o\s+que\s+(preciso|devo)\s+(enviar|mandar)|me\s+(fala|diga)\b/i.test(messageText)) {
    return false;
  }
  if (mergedPatchKeys > 0) return false;
  if (messageText.trim().length <= 20) return false;
  if (flags.hasConfirm || flags.hasCancel || flags.hasHelp) return false;
  if (
    flags.socialOnly &&
    flags.intents.every((i) => i === "greeting" || i === "unknown" || i === "emission_intent")
  ) {
    return false;
  }
  return true;
}

export async function fetchRecentConversationHistory(
  db: Sql,
  tenantId: string,
  sessionId: string,
  limit = 5,
): Promise<string[]> {
  const rows = await db<{ message_body: string }[]>`
    SELECT message_body FROM exeq_core.channel_message_log
    WHERE tenant_id = ${tenantId}::uuid
      AND session_id = ${sessionId}::uuid
      AND direction = 'inbound'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.message_body).reverse();
}
