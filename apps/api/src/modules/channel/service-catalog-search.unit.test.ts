import { describe, expect, it } from "vitest";
import {
  expandServiceHintTokens,
  normalizeServiceHint,
  scoreServiceDescription,
} from "./service-catalog-search.service.js";

describe("service-catalog-search", () => {
  it("normaliza acentos e caixa", () => {
    expect(normalizeServiceHint("Desenvolvimento de Software")).toBe("desenvolvimento de software");
  });

  it("expande sinônimos software → sistemas", () => {
    const tokens = expandServiceHintTokens("desenvolvimento de software");
    expect(tokens).toContain("desenvolvimento");
    expect(tokens).toContain("software");
    expect(tokens).toContain("sistemas");
  });

  it("pontua descrição do catálogo homolog", () => {
    const tokens = expandServiceHintTokens("desenvolvimento de software");
    const score = scoreServiceDescription("Analise e desenvolvimento de sistemas", tokens);
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it("sinônimo software casa com sistemas no catálogo", () => {
    const tokens = expandServiceHintTokens("software");
    expect(scoreServiceDescription("Analise e desenvolvimento de sistemas", tokens)).toBeGreaterThan(0);
  });
});
