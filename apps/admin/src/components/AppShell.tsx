import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ACCOUNTANT_NAV_GROUPS,
  ADMIN_NAV_GROUPS,
  defaultOpenGroupIds,
  isNavLinkActive,
  navTestId,
  readOpenNavGroups,
  writeOpenNavGroups,
  type AdminNavGroup,
} from "../lib/admin-nav.js";
import { clearToken, getUserRoles, isAccountantOnly } from "../lib/auth.js";

function SidebarNavGroups({
  groups,
  pathname,
  openGroupIds,
  onToggleGroup,
}: {
  groups: AdminNavGroup[];
  pathname: string;
  openGroupIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
}) {
  return (
    <nav className="sidebar__nav" aria-label="Menu principal">
      {groups.map((group) => {
        const open = openGroupIds.has(group.id);
        const panelId = `sidebar-panel-${group.id}`;
        return (
          <div
            key={group.id}
            className={`sidebar-accordion${open ? " sidebar-accordion--open" : ""}`}
          >
            <button
              type="button"
              className="sidebar-accordion__trigger"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => onToggleGroup(group.id)}
            >
              <span>{group.label}</span>
              <span className="sidebar-accordion__chevron" aria-hidden="true">
                ▾
              </span>
            </button>
            {open ? (
              <div id={panelId} className="sidebar-accordion__panel" role="group" aria-label={group.label}>
                {group.items.map((item) => {
                  const active = isNavLinkActive(pathname, item.to, groups);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      data-testid={navTestId(item.to)}
                      className={`sidebar__link${active ? " sidebar__link--active" : ""}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const accountantOnly = isAccountantOnly();
  const groups = accountantOnly ? ACCOUNTANT_NAV_GROUPS : ADMIN_NAV_GROUPS;
  const roles = getUserRoles();
  const [navOpen, setNavOpen] = useState(false);
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => {
    const stored = readOpenNavGroups();
    const ids = stored ?? defaultOpenGroupIds(location.pathname, groups);
    return new Set(ids);
  });

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      for (const group of groups) {
        if (group.items.some((item) => isNavLinkActive(location.pathname, item.to, groups))) {
          next.add(group.id);
        }
      }
      writeOpenNavGroups([...next]);
      return next;
    });
  }, [location.pathname, groups]);

  useEffect(() => {
    if (!navOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  function logout() {
    clearToken();
    window.location.href = "/login";
  }

  function toggleGroup(groupId: string) {
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      writeOpenNavGroups([...next]);
      return next;
    });
  }

  return (
    <div className={`app-shell${navOpen ? " app-shell--nav-open" : ""}`}>
      {navOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside className={`sidebar${navOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <Link to="/" className="sidebar__logo">
            EXEQ
          </Link>
          <div className="sidebar__tag">NFS-e &amp; Cobranca</div>
        </div>
        <SidebarNavGroups
          groups={groups}
          pathname={location.pathname}
          openGroupIds={openGroupIds}
          onToggleGroup={toggleGroup}
        />
        <div className="sidebar__footer">
          <span className="sidebar__roles">{roles.join(", ") || "admin"}</span>
        </div>
      </aside>
      <div className="shell-main">
        <header className="shell-header">
          <button
            type="button"
            className="shell-nav-toggle"
            aria-expanded={navOpen}
            aria-label={navOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setNavOpen((open) => !open)}
          >
            Menu
          </button>
          <div className="shell-header__brand">
            <h1 className="shell-header__title">Portal EXEQ</h1>
            <span className="shell-header__meta">multi-tenant · emissao NFS-e · cobranca</span>
          </div>
          <button type="button" className="shell-header__logout" onClick={logout}>
            Sair
          </button>
        </header>
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
}
