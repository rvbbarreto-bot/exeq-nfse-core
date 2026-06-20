import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash.js";

describe("sha256Hex", () => {
  it("gera hash determinístico", () => {
    const h = sha256Hex("teste");
    expect(h).toHaveLength(64);
    expect(sha256Hex("teste")).toBe(h);
  });
});
