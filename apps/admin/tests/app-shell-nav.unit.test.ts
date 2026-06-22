import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNTANT_NAV_GROUPS,
  ADMIN_NAV_GROUPS,
  anyGroupHasActivePath,
  defaultOpenGroupIds,
  groupHasActivePath,
  isNavLinkActive,
  isNavPathActive,
  navTestId,
  resolveActiveNavPath,
} from "../src/lib/admin-nav.js";

describe("admin-nav — sidebar accordion", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("resolve rota ativa pelo prefixo mais longo", () => {
    expect(resolveActiveNavPath("/issues/abc-123", ADMIN_NAV_GROUPS)).toBe("/issues");
    expect(resolveActiveNavPath("/catalogs/uuid", ADMIN_NAV_GROUPS)).toBe("/catalogs");
    expect(resolveActiveNavPath("/", ADMIN_NAV_GROUPS)).toBe("/");
  });

  it("marca apenas um link ativo por rota", () => {
    expect(isNavLinkActive("/issues/1", "/issues", ADMIN_NAV_GROUPS)).toBe(true);
    expect(isNavLinkActive("/issues/1", "/charges", ADMIN_NAV_GROUPS)).toBe(false);
  });

  it("detecta grupo com rota ativa para expandir acordeao", () => {
    expect(anyGroupHasActivePath("/charges/xyz", ADMIN_NAV_GROUPS)).toBe(true);
    expect(
      groupHasActivePath(
        "/charges/xyz",
        ADMIN_NAV_GROUPS.find((g) => g.id === "nfse")!,
      ),
    ).toBe(true);
    expect(anyGroupHasActivePath("/login", ADMIN_NAV_GROUPS)).toBe(false);
  });

  it("abre grupo da rota atual por padrao", () => {
    const open = defaultOpenGroupIds("/webhooks", ADMIN_NAV_GROUPS);
    expect(open).toContain("ops");
  });

  it("gera data-testid estavel para links", () => {
    expect(navTestId("/")).toBe("nav-dashboard");
    expect(navTestId("/master-data")).toBe("nav-master-data");
  });

  it("isNavPathActive trata dashboard como exato", () => {
    expect(isNavPathActive("/", "/")).toBe(true);
    expect(isNavPathActive("/issues", "/")).toBe(false);
  });
});
