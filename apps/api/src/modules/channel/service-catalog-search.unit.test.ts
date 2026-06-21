import { describe, expect, it } from "vitest";
import {
  extractSignificantHintWords,
  minScoreForSignificantWords,
  normalizeServiceHint,
  scoreServiceDescriptionForHint,
} from "./service-catalog-search.service.js";

describe("service-catalog-search", () => {
  it("normaliza acentos e caixa", () => {
    expect(normalizeServiceHint("Desenvolvimento de Software")).toBe("desenvolvimento de software");
  });

  it("extrai palavras significativas sem stopwords", () => {
    expect(extractSignificantHintWords("desenvolvimento de software")).toEqual([
      "desenvolvimento",
      "software",
    ]);
  });

  it("casa hint PO com descrição do catálogo homolog (1.01)", () => {
    const words = extractSignificantHintWords("desenvolvimento de software");
    const score = scoreServiceDescriptionForHint("Analise e desenvolvimento de sistemas", words);
    expect(score).toBeGreaterThanOrEqual(minScoreForSignificantWords(words.length));
    expect(score).toBe(2);
  });

  it("sinônimo software casa com sistemas no catálogo", () => {
    const words = extractSignificantHintWords("software");
    expect(scoreServiceDescriptionForHint("Analise e desenvolvimento de sistemas", words)).toBe(1);
  });

  it("ignora prefixo serviço no hint bruto", () => {
    const words = extractSignificantHintWords("serviço desenvolvimento de software");
    expect(words).toEqual(["desenvolvimento", "software"]);
    const score = scoreServiceDescriptionForHint("Analise e desenvolvimento de sistemas", words);
    expect(score).toBe(2);
  });
});
