import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDasGuiasQuery,
  formatCompetencia,
  formatCurrencyBrl,
  formatGuiaStatus,
  guiaStatusClass,
} from "../src/lib/das-ui.js";

vi.mock("../src/lib/auth.js", () => ({
  getUserRoles: () => ["tenant_admin"],
}));

describe("das-ui", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formata status de guia em portugues", () => {
    expect(formatGuiaStatus("DISPONIVEL")).toBe("Disponivel");
    expect(formatGuiaStatus("UNKNOWN")).toBe("UNKNOWN");
  });

  it("aplica classe visual por status", () => {
    expect(guiaStatusClass("PAGO")).toBe("ok");
    expect(guiaStatusClass("VENCIDO")).toBe("err");
  });

  it("formata moeda BRL", () => {
    expect(formatCurrencyBrl(1234.5)).toContain("1.234,50");
  });

  it("formata competencia YYYY-MM", () => {
    expect(formatCompetencia("2026-05")).toMatch(/2026/);
  });

  it("monta query string para listagem", () => {
    expect(
      buildDasGuiasQuery({
        status: "DISPONIVEL",
        tipo_guia: "DAS",
        competencia: "2026-05",
        limit: "50",
      }),
    ).toEqual({
      status: "DISPONIVEL",
      tipo_guia: "DAS",
      competencia: "2026-05",
      limit: "50",
    });
  });
});
