import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PILOT_IBGE_CODES, PILOT_MUNICIPIOS } from "@exeq/shared";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveDocsRoot(): string {
  const candidates = [
    path.resolve(coreRoot, "../docs"),
    path.resolve(coreRoot, "../EmissaoNFSe/docs"),
    path.resolve(coreRoot, "../../EmissaoNFSe/docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "evidencias/CR_PO_5O_MUNICIPIO_ASSINADO.md"))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

describe("Sprint 15 — 5º município Santo André", () => {
  it("FIS-15-01: CR PO e MUNICIPIOS_PILOTO_v3", async () => {
    const docs = resolveDocsRoot();
    const cr = await readFile(
      path.join(docs, "evidencias/CR_PO_5O_MUNICIPIO_ASSINADO.md"),
      "utf-8",
    );
    const v3 = await readFile(path.join(docs, "MUNICIPIOS_PILOTO_v3.md"), "utf-8");
    expect(cr).toContain("3547809");
    expect(v3).toContain("Santo André");
  });

  it("FIS-15-02: fixture catalog-3547809-validado (+6 regras)", async () => {
    const fixture = await readFile(
      path.join(coreRoot, "apps/api/fixtures/fiscal-p0/catalog-3547809-validado.json"),
      "utf-8",
    );
    const parsed = JSON.parse(fixture) as { rules: unknown[] };
    expect(parsed.rules.length).toBe(6);
  });

  it("FIS-15-03: PILOT_MUNICIPIOS com 4 IBGE operacionais", () => {
    expect(PILOT_MUNICIPIOS).toHaveLength(4);
    expect(PILOT_IBGE_CODES).toContain("3547809");
  });

  it("FIS-15-04/05: homolog E2E escopo 4 municípios", async () => {
    const e2e = await readFile(path.join(coreRoot, "e2e/homolog-portal.spec.ts"), "utf-8");
    expect(e2e).toContain("3547809");
    expect(e2e).toContain("Santo André");
  });

  it("FIS-15-06: script homolog emissão Santo André", async () => {
    const script = await readFile(
      path.join(coreRoot, "scripts/homolog-emission-santo-andre.mjs"),
      "utf-8",
    );
    const pkg = await readFile(path.join(coreRoot, "package.json"), "utf-8");
    expect(script).toContain("3547809");
    expect(pkg).toContain("homolog:emission:santo-andre");
  });

  it("FIS-15-07: seed ensureSantoAndreCatalogRules", async () => {
    const seed = await readFile(path.join(coreRoot, "apps/api/src/db/seed.ts"), "utf-8");
    expect(seed).toContain("ensureSantoAndreCatalogRules");
    expect(seed).toContain("catalog-3547809-validado.json");
  });
});
