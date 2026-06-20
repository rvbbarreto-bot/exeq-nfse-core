import { describe, expect, it } from "vitest";
import { hasAnyRole, WRITE_ROLES, EMIT_ROLES, ADMIN_ROLES } from "./rbac.js";

describe("rbac", () => {
  it("hasAnyRole aceita tenant_admin em WRITE_ROLES", () => {
    expect(hasAnyRole(["tenant_admin"], WRITE_ROLES)).toBe(true);
  });

  it("hasAnyRole rejeita readonly em WRITE_ROLES", () => {
    expect(hasAnyRole(["readonly"], WRITE_ROLES)).toBe(false);
  });

  it("accountant pode emitir mas nao escrever master data", () => {
    expect(hasAnyRole(["accountant"], EMIT_ROLES)).toBe(true);
    expect(hasAnyRole(["accountant"], WRITE_ROLES)).toBe(false);
  });

  it("somente tenant_admin publica catalogo", () => {
    expect(hasAnyRole(["tenant_admin"], ADMIN_ROLES)).toBe(true);
    expect(hasAnyRole(["operator"], ADMIN_ROLES)).toBe(false);
  });
});
