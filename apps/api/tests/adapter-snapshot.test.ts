import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertFocusPrevalidate, fiscalP0FixtureSchema } from "@exeq/shared";
import { mapExeqNfseV1ToFocusNfsen } from "../src/modules/integration/focus/focus-nfsen.adapter.js";
import { buildNfseV1FromP0Fixture } from "./helpers/build-nfse-from-p0.js";
import { municipalRulesFixtureForIbge } from "./helpers/municipal-rules-fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matrixDir = path.join(__dirname, "../fixtures/fiscal-p0/matrix");
const snapshotDir = path.join(__dirname, "../fixtures/fiscal-p0/adapter-snapshots");

describe("Focus adapter snapshots — matriz P0", () => {
  it("gera payload nfsen valido para 18 fixtures P0", async () => {
    const files = (await readdir(matrixDir)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(18);

    for (const file of files) {
      const raw = JSON.parse(await readFile(path.join(matrixDir, file), "utf8"));
      const fixture = fiscalP0FixtureSchema.parse(raw);
      const dto = buildNfseV1FromP0Fixture(
        fixture,
        150000,
        municipalRulesFixtureForIbge(fixture.input.ibge_code),
      );
      expect(() => assertFocusPrevalidate(dto)).not.toThrow();
      const payload = mapExeqNfseV1ToFocusNfsen(dto);
      expect(payload.codigo_municipio_prestacao).toBe(Number(fixture.input.ibge_code));
      expect(payload.codigo_tributacao_nacional_iss).toMatch(/^\d{6}$/);
      expect(payload.cnpj_prestador).toHaveLength(14);
    }
  });

  it("golden snapshot Atibaia 1.01 Simples", async () => {
    await assertGoldenSnapshot("ibge_3504107_atibaia_101_simples.json", "nfsen_3504107_atibaia_101_simples.request.json");
  });

  it("golden snapshot Braganca 1.01 Simples", async () => {
    await assertGoldenSnapshot(
      "ibge_3507605_braganca_paulista_101_simples.json",
      "nfsen_3507605_braganca_paulista_101_simples.request.json",
    );
  });

  it("golden snapshot Mairipora 1.01 Simples", async () => {
    await assertGoldenSnapshot(
      "ibge_3528502_mairipora_101_simples.json",
      "nfsen_3528502_mairipora_101_simples.request.json",
    );
  });
});

async function assertGoldenSnapshot(fixtureFile: string, snapshotFile: string) {
  const raw = JSON.parse(await readFile(path.join(matrixDir, fixtureFile), "utf8"));
  const fixture = fiscalP0FixtureSchema.parse(raw);
  const dto = buildNfseV1FromP0Fixture(
    fixture,
    150000,
    municipalRulesFixtureForIbge(fixture.input.ibge_code),
  );
  const payload = mapExeqNfseV1ToFocusNfsen(dto);
  const golden = JSON.parse(await readFile(path.join(snapshotDir, snapshotFile), "utf8"));
  expect(payload).toEqual(golden);
}
