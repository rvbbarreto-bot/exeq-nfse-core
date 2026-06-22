import { describe, expect, it } from "vitest";
import { canAccessNfArtifacts } from "../src/nf-issue.js";

describe("canAccessNfArtifacts", () => {
  it("permite autorizada e cancelada com focus ref", () => {
    expect(canAccessNfArtifacts("authorized", "exeq-1")).toBe(true);
    expect(canAccessNfArtifacts("cancelled", "exeq-1")).toBe(true);
  });

  it("nega sem focus ref ou status inválido", () => {
    expect(canAccessNfArtifacts("authorized", null)).toBe(false);
    expect(canAccessNfArtifacts("rejected", "exeq-1")).toBe(false);
    expect(canAccessNfArtifacts("failed", "exeq-1")).toBe(false);
  });
});
