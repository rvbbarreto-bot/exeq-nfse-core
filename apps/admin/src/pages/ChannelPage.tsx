import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { getToken } from "../lib/auth.js";
import { truncateId } from "../lib/charge-ui.js";

export function ChannelPage() {
  const token = getToken()!;

  const sessions = useQuery({
    queryKey: ["ops-channel-sessions"],
    queryFn: () => api.listChannelSessions(token),
  });

  const notifications = useQuery({
    queryKey: ["ops-channel-notifications"],
    queryFn: () => api.listChannelNotifications(token),
  });

  return (
    <AppShell>
      <main className="page" data-testid="page-channel">
        <h1>Canal WhatsApp</h1>
        <p className="muted">
          Sessões e notificações do fluxo n8n V13 → Channel API (homolog/produção).
        </p>

        <section className="card">
          <h2>Sessões recentes</h2>
          {sessions.isLoading ? <p>Carregando…</p> : null}
          {sessions.error ? <p className="error-banner">Falha ao carregar sessões.</p> : null}
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>NF issue</th>
                <th>Criada</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data?.items.map((s) => (
                <tr key={s.id}>
                  <td>{truncateId(s.id)}</td>
                  <td>{s.phone_e164}</td>
                  <td>{s.status}</td>
                  <td>
                    {s.nf_issue_id ? (
                      <Link to={`/issues/${s.nf_issue_id}`}>{truncateId(s.nf_issue_id)}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{s.created_at?.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Notificações</h2>
          {notifications.isLoading ? <p>Carregando…</p> : null}
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Evento</th>
                <th>Telefone</th>
                <th>Mensagem</th>
                <th>NF issue</th>
              </tr>
            </thead>
            <tbody>
              {notifications.data?.items.map((n) => (
                <tr key={n.id}>
                  <td>{n.status}</td>
                  <td>{n.event_type}</td>
                  <td>{n.phone_e164}</td>
                  <td title={n.message_preview}>{n.message_preview}</td>
                  <td>
                    {n.nf_issue_id ? (
                      <Link to={`/issues/${n.nf_issue_id}`}>{truncateId(n.nf_issue_id)}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  );
}
