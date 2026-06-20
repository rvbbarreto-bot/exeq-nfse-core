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
    <div className="page narrow">
      <h1>Exeq Admin</h1>
      <p className="muted">Operacao fiscal e emissao NFS-e</p>
      <form className="card" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" data-testid="login-submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
