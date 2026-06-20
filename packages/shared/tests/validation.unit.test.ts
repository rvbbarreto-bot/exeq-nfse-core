import { describe, expect, it } from "vitest";
import {
  assertCatalogEditable,
  CatalogNotEditableError,
  isDateWithinRule,
  nextCatalogVersion,
} from "../src/catalog-policy.js";
import { isValidCnpj, isValidCpf, stripDocument } from "../src/validation.js";

describe("validation — CPF/CNPJ", () => {
  it("valida CPF conhecido", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("rejeita CPF invalido", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("valida CNPJ conhecido", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("rejeita CNPJ invalido", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("stripDocument remove mascara", () => {
    expect(stripDocument("12.345.678/0001-81")).toBe("12345678000181");
  });
});

describe("catalog-policy", () => {
  it("permite edicao apenas em draft", () => {
    expect(() => assertCatalogEditable("draft")).not.toThrow();
    expect(() => assertCatalogEditable("published")).toThrow(CatalogNotEditableError);
  });

  it("incrementa versao do catalogo", () => {
    expect(nextCatalogVersion(1)).toBe(2);
    expect(nextCatalogVersion(0)).toBe(1);
  });

  it("valida vigencia da regra", () => {
    expect(isDateWithinRule("2026-06-15", "2026-06-01", null)).toBe(true);
    expect(isDateWithinRule("2026-05-01", "2026-06-01", null)).toBe(false);
    expect(isDateWithinRule("2026-07-01", "2026-06-01", "2026-06-30")).toBe(false);
  });
});
