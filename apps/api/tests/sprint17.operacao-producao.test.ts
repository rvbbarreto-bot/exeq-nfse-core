import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveDocsRoot(): string {
  const candidates = [
    path.resolve(coreRoot, "../docs"),
    path.resolve(coreRoot, "../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../Projeto_Emissao_NFSe"),
  ];
  for (const candidate of candidates) {
    const p = path.join(candidate, "evidencias/VALIDACAO_ENTREGA_RELEASE_2_2026-05-25.md");
    if (existsSync(p)) return candidate;
  }
  return candidates[0]!;
}

describe("Sprint 17 — operação produção + aceite homolog", () => {
  it("OP-17-01: script homolog-aceite-bundle existe", async () => {
    const script = await readFile(
      path.join(coreRoot, "scripts/homolog-aceite-bundle.mjs"),
      "utf-8",
    );
    expect(script).toContain("HOMOLOG_ACEITE_BUNDLE");
    expect(script).toContain("3504107");
  });

  it("OP-17-02: script prod-handoff existe", async () => {
    const script = await readFile(path.join(coreRoot, "scripts/prod-handoff.mjs"), "utf-8");
    expect(script).toContain("go-live:preflight");
    expect(script).toContain("smoke:prod");
  });

  it("OP-17-03: hypercare-report suporta --out e --fail-on-alert", async () => {
    const script = await readFile(path.join(coreRoot, "scripts/hypercare-report.mjs"), "utf-8");
    expect(script).toContain("--out");
    expect(script).toContain("--fail-on-alert");
  });

  it("OP-17-04: validação Release 2 e demanda Sprint 17", async () => {
    const docs = resolveDocsRoot();
    const validacao = await readFile(
      path.join(docs, "evidencias/VALIDACAO_ENTREGA_RELEASE_2_2026-05-25.md"),
      "utf-8",
    );
    const demanda = await readFile(
      path.join(docs, "DEMANDA_FABRICA_SPRINT_17_OPERACAO_PRODUCAO_ACEITE.md"),
      "utf-8",
    );
    expect(validacao).toContain("PR #31");
    expect(demanda).toContain("homolog:aceite:bundle");
  });
});
