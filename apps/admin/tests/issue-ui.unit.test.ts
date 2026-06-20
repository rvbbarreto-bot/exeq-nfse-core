import { describe, expect, it } from "vitest";
import {
  buildIssuesQuery,
  canCancelIssue,
  canReprocessIssue,
  formatAmountCents,
  formatIssueStatus,
  formatMunicipio,
  issueStatusClass,
  PILOT_MUNICIPIOS,
} from "../src/lib/issue-ui.js";

describe("issue-ui", () => {
  it("formata status conhecido", () => {
    expect(formatIssueStatus("authorized")).toBe("Autorizada");
    expect(formatIssueStatus("unknown")).toBe("unknown");
  });

  it("formata valor em reais", () => {
    expect(formatAmountCents(150000)).toContain("1.500");
  });

  it("identifica acoes por status", () => {
    expect(canCancelIssue("authorized")).toBe(true);
    expect(canReprocessIssue("failed")).toBe(true);
    expect(canCancelIssue("failed")).toBe(false);
  });

  it("formata municipio piloto e desconhecido", () => {
    expect(PILOT_MUNICIPIOS).toHaveLength(4);
    expect(formatMunicipio("3504107")).toContain("Atibaia");
    expect(formatMunicipio("3505708")).toBe("3505708");
    expect(formatMunicipio("9999999")).toBe("9999999");
  });

  it("classe CSS por status", () => {
    expect(issueStatusClass("authorized")).toBe("status-ok");
    expect(issueStatusClass("x")).toBe("status-neutral");
  });

  it("monta query de filtros completa", () => {
    const q = buildIssuesQuery({
      status: "authorized",
      ibge_code: "3504107",
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    expect(q.status).toBe("authorized");
    expect(q.from_date).toBe("2026-01-01");
    expect(q.limit).toBe("50");
  });
});
