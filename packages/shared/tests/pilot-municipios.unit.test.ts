import { describe, expect, it } from "vitest";
import {
  PILOT_MUNICIPIOS,
  PILOT_MUNICIPIO_5TH_CANDIDATES,
  findPilotMunicipio,
  isOperationalPilotIbge,
  resolveMunicipioIbgeFromText,
} from "../src/pilot-municipios.js";

describe("pilot-municipios — Sprint 15 prep", () => {
  it("operacional PO: 4 IBGE (Sprint 15)", () => {
    expect(PILOT_MUNICIPIOS).toHaveLength(4);
    expect(PILOT_MUNICIPIOS.map((m) => m.ibge_code)).toEqual([
      "3504107",
      "3507605",
      "3528502",
      "3547809",
    ]);
  });

  it("candidatos remanescentes não estão em PILOT_MUNICIPIOS", () => {
    for (const c of PILOT_MUNICIPIO_5TH_CANDIDATES) {
      expect(PILOT_MUNICIPIOS.some((m) => m.ibge_code === c.ibge_code)).toBe(false);
      expect(findPilotMunicipio(c.ibge_code)?.label).toBe(c.label);
      expect(isOperationalPilotIbge(c.ibge_code)).toBe(false);
    }
  });

  it("isOperationalPilotIbge inclui Santo André", () => {
    expect(isOperationalPilotIbge("3504107")).toBe(true);
    expect(isOperationalPilotIbge("3547809")).toBe(true);
    expect(isOperationalPilotIbge("3513801")).toBe(false);
  });

  it("resolveMunicipioIbgeFromText encontra cidade pelo nome", () => {
    expect(resolveMunicipioIbgeFromText("prestação em Atibaia")).toBe("3504107");
    expect(resolveMunicipioIbgeFromText("Santo André")).toBe("3547809");
  });
});
