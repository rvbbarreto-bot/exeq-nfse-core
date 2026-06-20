import { describe, expect, it } from "vitest";
import { canPublishCatalog, formatCatalogStatus } from "../src/lib/catalog-ui.js";

describe("catalog-ui", () => {
  it("bloqueia publicacao sem gates", () => {
    const result = canPublishCatalog(
      {
        csv_validated: false,
        rules_reviewed: false,
        validado_contador: false,
        terms_accepted: false,
      },
      5,
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("permite publicacao com checklist completo e regras", () => {
    const result = canPublishCatalog(
      {
        csv_validated: true,
        rules_reviewed: true,
        validado_contador: true,
        terms_accepted: true,
      },
      3,
    );
    expect(result.ok).toBe(true);
  });

  it("formata status do catalogo", () => {
    expect(formatCatalogStatus("draft")).toBe("Rascunho");
    expect(formatCatalogStatus("published")).toBe("Publicado");
  });
});
