export type AdminNavLink = {
  to: string;
  label: string;
  /** Visivel apenas para tenant_admin quando true */
  adminOnly?: boolean;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavLink[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    label: "Visao geral",
    items: [{ to: "/", label: "Dashboard" }],
  },
  {
    id: "nfse",
    label: "NFS-e e Cobranca",
    items: [
      { to: "/issues", label: "Emissoes" },
      { to: "/charges", label: "Cobrancas" },
      { to: "/channel", label: "Canal WhatsApp" },
    ],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    items: [
      { to: "/catalogs", label: "Catalogos" },
      { to: "/master-data", label: "Cadastros" },
      { to: "/das/guias", label: "Guias DAS/DARF" },
      { to: "/fiscal/backfill-snapshots", label: "Backfill snapshots", adminOnly: true },
    ],
  },
  {
    id: "ops",
    label: "Operacao",
    items: [{ to: "/webhooks", label: "Webhooks" }],
  },
];

export const ACCOUNTANT_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "accountant",
    label: "Portal contador",
    items: [
      { to: "/accountant", label: "Inicio" },
      { to: "/issues", label: "Emissoes" },
    ],
  },
];

export function navTestId(path: string): string {
  if (path === "/") return "nav-dashboard";
  return `nav-${path.replace(/^\//, "").replace(/\//g, "-")}`;
}

export function isNavPathActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function groupHasActivePath(pathname: string, group: AdminNavGroup): boolean {
  return group.items.some((item) => isNavPathActive(pathname, item.to));
}

export function anyGroupHasActivePath(pathname: string, groups: AdminNavGroup[]): boolean {
  return groups.some((group) => groupHasActivePath(pathname, group));
}

export function resolveActiveNavPath(pathname: string, groups: AdminNavGroup[]): string | null {
  const links = groups.flatMap((g) => g.items);
  const matches = links.filter((item) => isNavPathActive(pathname, item.to));
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => (cur.to.length > best.to.length ? cur : best)).to;
}

export function isNavLinkActive(pathname: string, path: string, groups: AdminNavGroup[]): boolean {
  return resolveActiveNavPath(pathname, groups) === path;
}

export const NAV_OPEN_GROUPS_KEY = "exeq_admin_nav_open_groups";

export function readOpenNavGroups(): string[] | null {
  try {
    const raw = sessionStorage.getItem(NAV_OPEN_GROUPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

export function writeOpenNavGroups(groupIds: string[]): void {
  sessionStorage.setItem(NAV_OPEN_GROUPS_KEY, JSON.stringify(groupIds));
}

export function defaultOpenGroupIds(pathname: string, groups: AdminNavGroup[]): string[] {
  const active = groups.filter((g) => groupHasActivePath(pathname, g)).map((g) => g.id);
  if (active.length > 0) return active;
  return groups.length > 0 ? [groups[0]!.id] : [];
}
