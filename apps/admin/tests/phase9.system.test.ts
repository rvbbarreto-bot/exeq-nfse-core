import { describe, expect, it } from "vitest";
import { buildDashboardKpis } from "../src/lib/dashboard.js";
import {
  buildIssuesQuery,
  formatMunicipio,
  PILOT_MUNICIPIOS,
  canCancelIssue,
  canReprocessIssue,
  formatIssueStatus,
} from "../src/lib/issue-ui.js";
import { canPublishCatalog } from "../src/lib/catalog-ui.js";
import { getToken, setToken, clearToken, isAuthenticated } from "../src/lib/auth.js";

describe("Fase 9 — admin testes de sistema", () => {
  it("QS-A01: dashboard consome stats API com 3 municípios piloto", () => {
    const stats = {
      total: 42,
      by_status: { authorized: 30, failed: 2, rejected: 1, polling: 1, queued: 1 },
      last_7_days: 12,
      pilot_municipios: PILOT_MUNICIPIOS.map((m) => ({
        ibge_code: m.ibge_code,
        label: m.label,
        count: 10,
      })),
    };
    const kpis = buildDashboardKpis(stats);
    expect(kpis.find((k) => k.key === "authorized")?.value).toBe(30);
    expect(stats.pilot_municipios).toHaveLength(4);
  });

  it("QS-A02: issue-ui cobre todos municípios piloto", () => {
    for (const m of PILOT_MUNICIPIOS) {
      expect(formatMunicipio(m.ibge_code)).toContain(m.ibge_code);
      expect(formatMunicipio(m.ibge_code)).toContain(m.label.split(" ")[0]!);
    }
    const q = buildIssuesQuery({
      status: "authorized",
      ibge_code: "3504107",
      from_date: "",
      to_date: "",
    });
    expect(q.ibge_code).toBe("3504107");
  });

  it("QS-A03: ações admin alinhadas à state machine API", () => {
    expect(canCancelIssue("authorized")).toBe(true);
    expect(canReprocessIssue("failed")).toBe(true);
    expect(formatIssueStatus("cancelled")).toBe("Cancelada");
  });

  it("QS-A04: governança catálogo — publicação exige checklist", () => {
    expect(
      canPublishCatalog(
        {
          csv_validated: false,
          rules_reviewed: true,
          validado_contador: true,
          terms_accepted: true,
        },
        18,
      ).ok,
    ).toBe(false);
    expect(
      canPublishCatalog(
        {
          csv_validated: true,
          rules_reviewed: true,
          validado_contador: true,
          terms_accepted: true,
        },
        18,
      ).ok,
    ).toBe(true);
  });

  it("QS-A05: auth localStorage — ciclo login/logout", () => {
    clearToken();
    expect(isAuthenticated()).toBe(false);
    setToken("jwt-test-phase9");
    expect(getToken()).toBe("jwt-test-phase9");
    expect(isAuthenticated()).toBe(true);
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });
});
