import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { getToken } from "../lib/auth.js";
import {
  canCancelCharge,
  canReprocessWebhookInbox,
  chargeStatusClass,
  formatChargeStatus,
  formatGatewayMode,
  gatewayModeClass,
  isHomologMockSandboxUrl,
  truncateId,
} from "../lib/charge-ui.js";
import { formatAmountCents } from "../lib/issue-ui.js";

export function ChargeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = getToken()!;
  const qc = useQueryClient();
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const chargeQuery = useQuery({
    queryKey: ["charge", id],
    queryFn: () => api.getCharge(token, id!),
    enabled: Boolean(id),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelCharge(token, id!),
    onSuccess: () => {
      setActionMsg("Cobrança cancelada.");
      setConfirmCancel(false);
      qc.invalidateQueries({ queryKey: ["charge", id] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["charge-stats"] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError &&
        err.body &&
        typeof err.body === "object" &&
        err.body !== null &&
        "message" in err.body
          ? String((err.body as { message: string }).message)
          : "Não foi possível cancelar a cobrança.";
      setActionMsg(message);
    },
  });

  const charge = chargeQuery.data;

  return (
    <AppShell>
      <main className="page" data-testid="page-charge-detail">
        <p>
          <Link to="/charges">← Voltar para cobranças</Link>
        </p>
        {chargeQuery.isLoading && <p>Carregando...</p>}
        {chargeQuery.error && <p className="error">Cobrança não encontrada</p>}

        {charge && (
          <>
            <div className="row">
              <h1>Cobrança</h1>
              <span className={`pill ${chargeStatusClass(charge.status)}`}>
                {formatChargeStatus(charge.status)}
              </span>
            </div>

            <section className="grid two-col">
              <article className="card">
                <h2>Resumo</h2>
                <dl className="detail-list">
                  <div>
                    <dt>ID</dt>
                    <dd className="mono">{charge.id}</dd>
                  </div>
                  <div>
                    <dt>Tomador</dt>
                    <dd className="mono">{charge.customer_id}</dd>
                  </div>
                  <div>
                    <dt>Valor</dt>
                    <dd>{formatAmountCents(charge.amount_cents)}</dd>
                  </div>
                  <div>
                    <dt>Vencimento</dt>
                    <dd>{charge.due_date}</dd>
                  </div>
                  {(charge.gateway_ref || charge.gateway_sandbox_url) && (
                    <div className="detail-span-all" data-testid="charge-gateway">
                      <dt>Gateway</dt>
                      <dd>
                        {formatGatewayMode(charge.gateway_mode, charge.gateway_ref) && (
                          <p
                            className={`pill ${gatewayModeClass(charge.gateway_mode)}`}
                            data-testid="charge-gateway-mode"
                          >
                            {formatGatewayMode(charge.gateway_mode, charge.gateway_ref)}
                          </p>
                        )}
                        <dl className="detail-list nested">
                          <div>
                            <dt>Referência</dt>
                            <dd className="mono">{charge.gateway_ref ?? "—"}</dd>
                          </div>
                          {charge.gateway_sandbox_url && (
                            <div>
                              <dt>Link sandbox</dt>
                              <dd>
                                <a
                                  data-testid="charge-gateway-sandbox-link"
                                  href={charge.gateway_sandbox_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {charge.gateway_sandbox_url}
                                </a>
                                {isHomologMockSandboxUrl(charge.gateway_sandbox_url) && (
                                  <p
                                    className="muted"
                                    data-testid="charge-sandbox-homolog-hint"
                                  >
                                    Homolog/mock — DNS opcional; em produção use gateway real.
                                  </p>
                                )}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>NF vinculada</dt>
                    <dd>
                      {charge.nf_issue_id ? (
                        <Link
                          to={`/issues/${charge.nf_issue_id}`}
                          data-testid="charge-nf-issue-link"
                        >
                          {charge.nf_issue_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Idempotency</dt>
                    <dd className="mono">{charge.idempotency_key}</dd>
                  </div>
                  <div>
                    <dt>Correlation</dt>
                    <dd className="mono">{charge.correlation_id}</dd>
                  </div>
                  <div>
                    <dt>Descrição</dt>
                    <dd>{charge.description ?? "—"}</dd>
                  </div>
                </dl>
              </article>

              <article className="card">
                <h2>Ações</h2>
                {canCancelCharge(charge.status) && (
                  <div className="action-block">
                    {!confirmCancel ? (
                      <button type="button" onClick={() => setConfirmCancel(true)}>
                        Cancelar cobrança
                      </button>
                    ) : (
                      <>
                        <p className="muted">
                          Confirmar cancelamento de {formatAmountCents(charge.amount_cents)}?
                        </p>
                        <button
                          type="button"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate()}
                        >
                          Confirmar cancelamento
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setConfirmCancel(false)}
                        >
                          Voltar
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!canCancelCharge(charge.status) && (
                  <p className="muted">Nenhuma ação disponível para este status.</p>
                )}
                {actionMsg && <p className="ok">{actionMsg}</p>}
              </article>
            </section>

            <section className="card" data-testid="charge-payment-events">
              <h2>Eventos de pagamento</h2>
              {charge.payment_events.length === 0 && (
                <p className="muted">Nenhum pagamento registrado.</p>
              )}
              <ul className="timeline">
                {charge.payment_events.map((ev) => (
                  <li key={ev.id}>
                    <div className="timeline-head">
                      <strong>{formatAmountCents(ev.amount_cents)}</strong>
                      <span className="muted">
                        {new Date(ev.paid_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="muted mono">Gateway: {ev.gateway_ref ?? "—"}</p>
                    {ev.webhook_inbox_id && (
                      <WebhookInboxActions
                        token={token}
                        inboxId={ev.webhook_inbox_id}
                        onDone={() => {
                          qc.invalidateQueries({ queryKey: ["charge", id] });
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

function WebhookInboxActions({
  token,
  inboxId,
  onDone,
}: {
  token: string;
  inboxId: string;
  onDone: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: ["webhook-inbox", inboxId],
    queryFn: () => api.getWebhookInbox(token, inboxId),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => api.reprocessWebhookInbox(token, inboxId),
    onSuccess: () => {
      setMsg("Webhook reenfileirado para reprocessamento.");
      onDone();
      inboxQuery.refetch();
    },
    onError: () => setMsg("Não foi possível reprocessar o webhook."),
  });

  const inbox = inboxQuery.data;

  return (
    <div className="action-block">
      <p className="muted">
        Webhook inbox: <span className="mono">{truncateId(inboxId)}</span>
        {inbox && (
          <>
            {" "}
            · <span className={`pill ${inbox.status === "failed" ? "err" : ""}`}>{inbox.status}</span>
          </>
        )}
      </p>
      {inbox?.error_message && <p className="error">{inbox.error_message}</p>}
      {inbox && canReprocessWebhookInbox(inbox.status) && (
        <button
          type="button"
          disabled={reprocessMutation.isPending}
          onClick={() => reprocessMutation.mutate()}
        >
          Reprocessar webhook
        </button>
      )}
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}
