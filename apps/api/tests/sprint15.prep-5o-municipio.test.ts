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
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "MUNICIPIOS_PILOTO_v3.md"))) return candidate;
  }
  return candidates[0]!;
}

describe("Sprint 15 prep — 5º município (bloqueado CR PO)", () => {
  it("FIS-15-prep-01: MUNICIPIOS_PILOTO_v3", async () => {
    const docs = resolveDocsRoot();
    const v3 = await readFile(path.join(docs, "MUNICIPIOS_PILOTO_v3.md"), "utf-8");
    expect(v3).toContain("3504107");
    expect(v3).toContain("3547809");
    expect(v3).toContain("Santo André");
  });

  it("FIS-15-prep-02: template CR PO", async () => {
    const docs = resolveDocsRoot();
    const cr = await readFile(
      path.join(docs, "templates/CR_PO_5O_MUNICIPIO_TEMPLATE.md"),
      "utf-8",
    );
    expect(cr).toContain("IBGE escolhido");
  });

  it("FIS-15-prep-03: sprint15-preflight script", async () => {
    const script = await readFile(path.join(coreRoot, "scripts/sprint15-preflight.mjs"), "utf-8");
    expect(script).toContain("SPRINT15_CR_PO_SIGNED");
    expect(script).toContain("exit(2)");
  });

  it("FIS-15-prep-04: candidatos em shared", async () => {
    const pilot = await readFile(
      path.join(coreRoot, "packages/shared/src/pilot-municipios.ts"),
      "utf-8",
    );
    expect(pilot).toContain("PILOT_MUNICIPIO_5TH_CANDIDATES");
    expect(pilot).toContain("isOperationalPilotIbge");
  });
});
