import { afterEach, describe, expect, it } from "vitest";
import { clearToken, getToken, isAuthenticated, setToken } from "../src/lib/auth.js";

describe("auth storage", () => {
  afterEach(() => {
    clearToken();
  });

  it("persiste e le token", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
    expect(isAuthenticated()).toBe(true);
  });

  it("limpa token", () => {
    setToken("abc");
    clearToken();
    expect(getToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
