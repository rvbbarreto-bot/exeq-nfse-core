import { describe, expect, it } from "vitest";
import { captureDasReceita, captureDarfReceita } from "../src/modules/das/receita-gateway.service.js";

describe("receita-gateway.service", () => {
  it("captureDasReceita retorna mock aprovado", async () => {
    const result = await captureDasReceita({
      cnpj: "12345678000199",
      competencia: "2026-05",
    });
    expect(result.valorPrincipal).toBeGreaterThan(0);
    expect(result.complianceStatus).toBe("aprovado");
    expect(result.linhaDigitavel.length).toBeGreaterThan(40);
    expect(result.pdfBytes.length).toBeGreaterThan(10);
  });

  it("captureDarfReceita retorna mock DARF", async () => {
    const result = await captureDarfReceita({
      cnpj: "12345678000199",
      competencia: "2026-05",
      codigoReceita: "8109",
      periodoApuracao: "2026-05-31",
    });
    expect(result.valorPrincipal).toBeGreaterThan(200);
    expect(result.dataVencimento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
