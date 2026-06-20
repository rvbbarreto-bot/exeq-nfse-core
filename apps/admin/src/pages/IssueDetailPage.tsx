import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import {
  canCancelIssue,
  canReprocessIssue,
  formatAmountCents,
  formatIssueStatus,
  formatMunicipio,
  issueStatusClass,
} from "../lib/issue-ui.js";
import { buildChargesQuery, formatChargeStatus, truncateId } from "../lib/charge-ui.js";
import { getToken } from "../lib/auth.js";
import { downloadCsvExport } from "../lib/export-download.js";
import {
  buildLinkedChargeIdempotencyKey,
  defaultChargeDueDate,
  hasActiveLinkedCharge,
} from "../lib/issue-linked-charge.js";

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = getToken()!;
  const qc = useQueryClient();
  const [justificativa, setJustificativa] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [exportingEvents, setExportingEvents] = useState(false);
  const [chargeDueDate, setChargeDueDate] = useState(defaultChargeDueDate());
  const [chargeDescription, setChargeDescription] = useState("");

  const issueQuery = useQuery({
    queryKey: ["issue", id],
    queryFn: () => api.getIssue(token, id!),
    enabled: Boolean(id),
  });

  const linkedChargesQuery = useQuery({
    queryKey: ["charges", "nf-issue", id],
    queryFn: () =>
      api.listCharges(token, buildChargesQuery({ status: "", nf_issue_id: id! })),
    enabled: Boolean(id),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelIssue(token, id!, justificativa),
    onSuccess: (res) => {
      setActionMsg(res.operator?.detail ?? "NFS-e cancelada.");
      qc.invalidateQueries({ queryKey: ["issue", id] });
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["issue-stats"] });
    },
    onError: () => setActionMsg("Nao foi possivel cancelar a NFS-e."),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => api.reprocessIssue(token, id!),
    onSuccess: () => {
      setActionMsg("Emissao reenfileirada para reprocessamento.");
      qc.invalidateQueries({ queryKey: ["issue", id] });
    },
    onError: () => setActionMsg("Reprocessamento nao permitido neste status."),
  });

  const createChargeMutation = useMutation({
    mutationFn: () => {
      const issueRow = issueQuery.data!;
      return api.createCharge(token, {
        idempotency_key: buildLinkedChargeIdempotencyKey(issueRow.id),
        customer_id: issueRow.customer_id,
        amount_cents: issueRow.amount_cents,
        due_date: chargeDueDate,
        description: chargeDescription.trim() || `Cobrança emissão ${issueRow.id.slice(0, 8)}`,
        nf_issue_id: issueRow.id,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["charges", "nf-issue", id] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      navigate(`/charges/${res.id}`);
    },
    onError: () => setActionMsg("Não foi possível criar a cobrança vinculada."),
  });

  const issue = issueQuery.data;
  const linkedCharges = linkedChargesQuery.data?.items ?? [];
  const showCreateCharge =
    Boolean(issue) && !hasActiveLinkedCharge(linkedCharges) && !createChargeMutation.isPending;

  async function exportEventsCsv() {
    if (!id) return;
    setExportingEvents(true);
    try {
      await downloadCsvExport(
        `/v1/nf/issues/${id}/events/export`,
        token,
        {},
        `emissao-eventos-${id.slice(0, 8)}.csv`,
      );
    } catch {
      setActionMsg("Falha ao exportar eventos.");
    } finally {
      setExportingEvents(false);
    }
  }

  return (
    <AppShell>
      <main className="page" data-testid="page-issue-detail">
        <p>
          <Link to="/issues">← Voltar para emissoes</Link>
        </p>
        {issueQuery.isLoading && <p>Carregando...</p>}
        {issueQuery.error && <p className="error">Emissao nao encontrada</p>}

        {issue && (
          <>
            <div className="row">
              <h1>Emissao NFS-e</h1>
              <span className={`pill ${issueStatusClass(issue.status)}`}>
                {formatIssueStatus(issue.status)}
              </span>
            </div>

            <section className="grid two-col">
              <article className="card">
                <h2>Resumo</h2>
                <dl className="detail-list">
                  <div>
                    <dt>ID</dt>
                    <dd className="mono">{issue.id}</dd>
                  </div>
                  <div>
                    <dt>Município</dt>
                    <dd data-testid="issue-municipio">{formatMunicipio(issue.ibge_code)}</dd>
                  </div>
                  <div>
                    <dt>Competencia</dt>
                    <dd>{issue.competence_date}</dd>
                  </div>
                  <div>
                    <dt>Valor</dt>
                    <dd>{formatAmountCents(issue.amount_cents)}</dd>
                  </div>
                  <div>
                    <dt>Focus ref</dt>
                    <dd className="mono">{issue.focus_ref ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Correlation</dt>
                    <dd className="mono">{issue.correlation_id}</dd>
                  </div>
                  <div>
                    <dt>Criada em</dt>
                    <dd>{new Date(issue.created_at).toLocaleString("pt-BR")}</dd>
                  </div>
                </dl>
              </article>

              <article className="card">
                <h2>Acoes</h2>
                {canCancelIssue(issue.status) && (
                  <div className="action-block">
                    <label>
                      Justificativa cancelamento (min. 15 caracteres)
                      <textarea
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        rows={3}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={justificativa.length < 15 || cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate()}
                    >
                      Cancelar NFS-e
                    </button>
                  </div>
                )}
                {canReprocessIssue(issue.status) && (
                  <button
                    type="button"
                    disabled={reprocessMutation.isPending}
                    onClick={() => reprocessMutation.mutate()}
                  >
                    Reprocessar emissao
                  </button>
                )}
                {!canCancelIssue(issue.status) && !canReprocessIssue(issue.status) && (
                  <p className="muted">Nenhuma acao disponivel para este status.</p>
                )}
                {actionMsg && <p className="ok">{actionMsg}</p>}
              </article>
            </section>

            <section className="card" data-testid="issue-linked-charges">
              <h2>Cobranças vinculadas</h2>
              {showCreateCharge && (
                <div className="action-block" data-testid="issue-create-charge-form">
                  <p className="muted">
                    Criar cobrança no gateway vinculada a esta emissão (Sprint 10).
                  </p>
                  <label>
                    Vencimento
                    <input
                      type="date"
                      value={chargeDueDate}
                      onChange={(e) => setChargeDueDate(e.target.value)}
                      data-testid="issue-charge-due-date"
                    />
                  </label>
                  <label>
                    Descrição (opcional)
                    <input
                      type="text"
                      value={chargeDescription}
                      onChange={(e) => setChargeDescription(e.target.value)}
                      data-testid="issue-charge-description"
                    />
                  </label>
                  <button
                    type="button"
                    data-testid="issue-create-charge"
                    disabled={createChargeMutation.isPending || !chargeDueDate}
                    onClick={() => createChargeMutation.mutate()}
                  >
                    {createChargeMutation.isPending ? "Criando..." : "Criar cobrança vinculada"}
                  </button>
                </div>
              )}
              {linkedChargesQuery.isLoading && <p className="muted">Carregando...</p>}
              {linkedCharges.length === 0 && !showCreateCharge && (
                <p className="muted">Nenhuma cobrança vinculada a esta emissão.</p>
              )}
              {linkedCharges.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Valor</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedCharges.map((charge) => (
                      <tr key={charge.id}>
                        <td className="mono">{truncateId(charge.id)}</td>
                        <td>{formatChargeStatus(charge.status)}</td>
                        <td>{formatAmountCents(charge.amount_cents)}</td>
                        <td>
                          <Link to={`/charges/${charge.id}`}>Ver detalhe</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card">
              <div className="row">
                <h2>Timeline de eventos</h2>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={exportingEvents}
                  onClick={exportEventsCsv}
                >
                  {exportingEvents ? "Exportando..." : "Exportar eventos CSV"}
                </button>
              </div>
              <ol className="timeline">
                {issue.events.map((ev) => (
                  <li key={ev.id}>
                    <div className="timeline-head">
                      <strong>{formatIssueStatus(ev.to_status)}</strong>
                      <span className="muted">{new Date(ev.occurred_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="muted">
                      {ev.from_status ? `${formatIssueStatus(ev.from_status)} → ` : ""}
                      {formatIssueStatus(ev.to_status)} · {ev.actor}
                    </p>
                    {operatorMessage(ev.metadata) && <p>{operatorMessage(ev.metadata)}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

function operatorMessage(metadata: Record<string, unknown> | null): string | null {
  const op = metadata?.operator;
  if (op && typeof op === "object" && op !== null && "detail" in op) {
    return String((op as { detail: string }).detail);
  }
  return null;
}
