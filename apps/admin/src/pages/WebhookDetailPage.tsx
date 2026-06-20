import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { getToken } from "../lib/auth.js";
import {
  canReprocessWebhookInbox,
  formatWebhookStatus,
  webhookStatusClass,
} from "../lib/webhook-ui.js";

export function WebhookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = getToken()!;
  const [msg, setMsg] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["webhook-inbox", id],
    queryFn: () => api.getWebhookInbox(token, id!),
    enabled: !!id,
  });

  const reprocessMutation = useMutation({
    mutationFn: () => api.reprocessWebhookInbox(token, id!),
    onSuccess: () => {
      setMsg("Webhook reenfileirado para processamento.");
      void detailQuery.refetch();
    },
    onError: () => setMsg("Não foi possível reprocessar o webhook."),
  });

  const inbox = detailQuery.data;

  return (
    <AppShell>
      <main className="page">
        <p>
          <Link to="/webhooks">← Voltar para webhooks</Link>
        </p>
        <h1>Webhook inbox</h1>

        {detailQuery.isLoading && <p className="muted">Carregando...</p>}
        {detailQuery.error && <p className="error">Webhook não encontrado</p>}

        {inbox && (
          <section className="card">
            <dl className="detail-grid">
              <dt>Status</dt>
              <dd>
                <span className={`pill ${webhookStatusClass(inbox.status)}`}>
                  {formatWebhookStatus(inbox.status)}
                </span>
              </dd>
              <dt>Inbox ID</dt>
              <dd className="mono">{inbox.id}</dd>
              <dt>Idempotency key</dt>
              <dd className="mono">{inbox.idempotency_key}</dd>
              <dt>Criado em</dt>
              <dd>{new Date(inbox.created_at).toLocaleString("pt-BR")}</dd>
              <dt>Processado em</dt>
              <dd>
                {inbox.processed_at
                  ? new Date(inbox.processed_at).toLocaleString("pt-BR")
                  : "—"}
              </dd>
            </dl>

            {inbox.error_message && <p className="error">{inbox.error_message}</p>}

            {canReprocessWebhookInbox(inbox.status) && (
              <button
                type="button"
                disabled={reprocessMutation.isPending}
                onClick={() => reprocessMutation.mutate()}
              >
                {reprocessMutation.isPending ? "Reprocessando..." : "Reprocessar webhook"}
              </button>
            )}

            {msg && <p className="muted">{msg}</p>}
          </section>
        )}
      </main>
    </AppShell>
  );
}
