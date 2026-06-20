import { describe, expect, it } from "vitest";
import {
  isHomologEmissionGateReady,
  ATIBAIA_IBGE,
} from "../src/homolog-emission-gate.js";

describe("homolog-emission-gate", () => {
  it("exporta IBGE Atibaia", () => {
    expect(ATIBAIA_IBGE).toBe("3504107");
  });

  it("aceita FOCUS_MOCK=true", () => {
    const r = isHomologEmissionGateReady({ focus: { mock: true } });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("focus_mock");
  });

  it("aceita focus_nacional real no roteamento Atibaia", () => {
    const r = isHomologEmissionGateReady({
      focus: { mock: false },
      atibaia_routing: { provider: "focus_nacional" },
    });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("focus_nacional_real");
  });

  it("rejeita quando health ausente", () => {
    const r = isHomologEmissionGateReady(null);
    expect(r.ok).toBe(false);
    expect(r.mode).toBe("none");
  });

  it("rejeita sem mock e sem roteamento focus", () => {
    const r = isHomologEmissionGateReady({ focus: { mock: false } });
    expect(r.ok).toBe(false);
  });

  it("prioriza focus_mock", () => {
    const r = isHomologEmissionGateReady({
      focus: { mock: true },
      atibaia_routing: { provider: "focus_nacional" },
    });
    expect(r.mode).toBe("focus_mock");
  });
});
