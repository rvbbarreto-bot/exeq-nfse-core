import { Link, useLocation } from "react-router-dom";
import { clearToken } from "../lib/auth.js";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/master-data", label: "Cadastros" },
  { to: "/issues", label: "Emissoes" },
  { to: "/charges", label: "Cobrancas" },
  { to: "/webhooks", label: "Webhooks" },
  { to: "/channel", label: "Canal" },
  { to: "/catalogs", label: "Catalogos" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  function logout() {
    clearToken();
    window.location.href = "/login";
  }

  function isActive(path: string): boolean {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Exeq Admin
        </Link>
        <nav className="topnav">
          {NAV.map((item) => {
            const testId =
              item.to === "/" ? "nav-dashboard" : `nav-${item.to.replace(/^\//, "")}`;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={testId}
                className={isActive(item.to) ? "active" : ""}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className="badge">Release 1.4</span>
        <button type="button" className="btn-ghost" onClick={logout}>
          Sair
        </button>
      </header>
      {children}
    </>
  );
}
