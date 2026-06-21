import { describe, expect, it } from "vitest";
import { normalizeMunicipioSearchTerm } from "../src/modules/channel/ibge-lookup.service.js";

describe("normalizeMunicipioSearchTerm", () => {
  it("remove acentos e normaliza", () => {
    expect(normalizeMunicipioSearchTerm("Bragança Paulista")).toBe("braganca paulista");
    expect(normalizeMunicipioSearchTerm("  São   José  ")).toBe("sao jose");
  });
});
