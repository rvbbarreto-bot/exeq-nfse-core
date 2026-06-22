import { describe, expect, it } from "vitest";
import { APP_SIDEBAR_ID, MAIN_CONTENT_ID, navAriaCurrent } from "../src/lib/a11y-nav.js";

describe("a11y-nav", () => {
  it("navAriaCurrent retorna page apenas quando ativo", () => {
    expect(navAriaCurrent(true)).toBe("page");
    expect(navAriaCurrent(false)).toBeUndefined();
  });

  it("exporta ids estaveis para landmarks", () => {
    expect(MAIN_CONTENT_ID).toBe("main-content");
    expect(APP_SIDEBAR_ID).toBe("app-sidebar");
  });
});
