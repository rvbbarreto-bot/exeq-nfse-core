import { describe, expect, it, vi } from "vitest";
import { llmOutputToRawDraftPatch } from "../src/modules/channel/llm-extraction.service.js";
import type { LlmExtractionOutput } from "../src/modules/channel/llm-extraction.service.js";

describe("llmOutputToRawDraftPatch", () => {
  it("converte campos brutos LLM para patch ChannelDraft", () => {
    const output: LlmExtractionOutput = {
      extracted_fields: {
        tomador_nome: "João da Silva",
        tomador_cnpj: "12345678901",
        valor_servico: 2500,
        descricao_servico: "consultoria",
        cidade: "Atibaia",
        data_competencia: "2025-10-01",
        service_code_hint: "consultoria técnica",
      },
      missing_fields: ["cidade"],
      confidence_score: 0.85,
      ambiguous_fields: [],
      intent: "inform",
      raw_response: "{}",
    };

    const patch = llmOutputToRawDraftPatch(output);
    expect(patch.tomador_name).toBe("João da Silva");
    expect(patch.tomador_document).toBe("12345678901");
    expect(patch.amount_cents).toBe(250000);
    expect(patch.description).toBe("consultoria");
    expect(patch.city_hint).toBe("Atibaia");
    expect(patch.service_hint).toBe("consultoria técnica");
    expect(patch.competence_date).toBe("2025-10-01");
  });
});

describe("extractFieldsWithLlm", () => {
  it("parseia JSON da OpenAI (mock fetch)", async () => {
    const mockResponse = {
      model: "gpt-4o-mini",
      usage: { total_tokens: 120 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              tomador_nome: "ABC Construções",
              tomador_cnpj: "12345678000199",
              valor_servico: 8750,
              descricao_servico: null,
              cidade: "Atibaia",
              data_competencia: "2025-11-15",
              service_code_hint: null,
              missing_fields: ["descricao_servico"],
              confidence_score: 0.8,
              ambiguous_fields: [],
              intent: "inform",
            }),
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );

    process.env.OPENAI_API_KEY = "test-key";
    process.env.CHANNEL_LLM_FALLBACK_ENABLED = "true";
    vi.resetModules();
    const { extractFieldsWithLlm } = await import("../src/modules/channel/llm-extraction.service.js");

    const result = await extractFieldsWithLlm({
      consolidated_text:
        "Empresa ABC Construções CNPJ 12345678000199, serviço em Atibaia, 15 de novembro, R$ 8.750",
      current_draft: {},
      conversation_history: [],
    });

    expect(result.extracted_fields.tomador_nome).toBe("ABC Construções");
    expect(result.extracted_fields.valor_servico).toBe(8750);
    expect(result.confidence_score).toBe(0.8);
    expect(result.intent).toBe("inform");

    vi.unstubAllGlobals();
  });
});
