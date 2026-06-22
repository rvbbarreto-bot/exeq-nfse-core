import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { setToken } from "../lib/auth.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@piloto.local");
  const [password, setPassword] = useState("changeme");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      setToken(res.access_token);
      navigate("/");
    } catch {
      setError("Falha no login. Verifique email e senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-layout">
      <div className="login-brand">
        <h1 className="login-brand__logo">EXEQ</h1>
        <p className="login-brand__tag">NFS-e &amp; Cobranca</p>
        <p className="login-brand__lead">
          Portal unificado para emissao de NFS-e, cobranca gateway e guias fiscais DAS/DARF — multi-tenant com
          rastreabilidade operacional.
        </p>
        <p className="login-brand__sub">
          Acesso restrito a operadores e contadores autorizados. Sessao JWT com isolamento por tenant (RLS).
        </p>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <h2 className="login-card__title">Entrar</h2>
          <p className="login-card__subtitle">Email e senha do tenant piloto ou producao</p>
          <form onSubmit={onSubmit} className="stack">
            <label htmlFor="login-email">
              Email
              <input
                id="login-email"
                type="email"
                data-testid="login-email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label htmlFor="login-password">
              Senha
              <input
                id="login-password"
                type="password"
                data-testid="login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error ? (
              <div className="banner-err" role="alert">
                {error}
              </div>
            ) : null}
            <button type="submit" className="btn-login-cta" data-testid="login-submit" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <div className="login-footer">Autenticacao JWT · RLS · auditoria de emissao</div>
        </div>
      </div>
    </main>
  );
}
