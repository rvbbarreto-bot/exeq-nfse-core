import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { downloadCsvExport } from "../lib/export-download.js";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { getToken } from "../lib/auth.js";
import { truncateId } from "../lib/charge-ui.js";
import {
  buildWebhooksQuery,
  FILTER_WEBHOOK_STATUS_OPTIONS,
  formatWebhookStatus,
  webhookStatusClass,
} from "../lib/webhook-ui.js";

export function WebhooksPage() {
  const token = getToken()!;
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "failed");
  const [idempotencyKey, setIdempotencyKey] = useState(searchParams.get("idempotency_key") ?? "");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filterKey = `${status}|${idempotencyKey}`;

  const webhooksQuery = useInfiniteQuery({
    queryKey: ["webhooks", filterKey],
    queryFn: ({ pageParam }) =>
      api.listWebhookInbox(
        token,
        buildWebhooksQuery({ status, idempotency_key: idempotencyKey, cursor: pageParam }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const items = webhooksQuery.data?.pages.flatMap((p) => p.items) ?? [];

  function applyFilter() {
    const next = new URLSearchParams();
    if (status) next.set("status", status);
    if (idempotencyKey) next.set("idempotency_key", idempotencyKey);
    setSearchParams(next);
    void webhooksQuery.refetch();
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const q = buildWebhooksQuery({ status, idempotency_key: idempotencyKey });
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsvExport("/v1/webhooks/inbox/export", token, q, `webhooks-inbox-${date}.csv`);
    } catch {
      setExportError("Falha ao exportar CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <main className="page">
        <h1>Webhooks (inbox)</h1>
        <p className="muted">Triagem de pagamentos recebidos do gateway — reprocessar falhas sem Redis/CLI.</p>

        <section className="card filters">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {FILTER_WEBHOOK_STATUS_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Idempotency key
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
            />
          </label>
          <div className="filter-actions">
            <button type="button" onClick={applyFilter}>
              Aplicar filtro
            </button>
            <button type="button" className="btn-ghost" disabled={exporting} onClick={exportCsv}>
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
          {exportError && <p className="error">{exportError}</p>}
        </section>

        {webhooksQuery.isLoading && <p>Carregando webhooks...</p>}
        {webhooksQuery.error && <p className="error">Erro ao listar webhooks</p>}

        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Inbox ID</th>
              <th>Idempotency</th>
              <th>Cobrança</th>
              <th>Criado em</th>
              <th>Erro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className={`pill ${webhookStatusClass(row.status)}`}>
                    {formatWebhookStatus(row.status)}
                  </span>
                </td>
                <td className="mono">{truncateId(row.id)}</td>
                <td className="mono muted">{truncateId(row.idempotency_key)}</td>
                <td>
                  {row.charge_id ? (
                    <Link to={`/charges/${row.charge_id}`}>{truncateId(row.charge_id)}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{new Date(row.created_at).toLocaleString("pt-BR")}</td>
                <td className="muted">{row.error_message?.slice(0, 60) ?? "—"}</td>
                <td>
                  <Link to={`/webhooks/${row.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!webhooksQuery.isLoading && items.length === 0 && (
          <p className="muted">Nenhum webhook com os filtros atuais.</p>
        )}

        {webhooksQuery.hasNextPage && (
          <button
            type="button"
            className="btn-ghost"
            disabled={webhooksQuery.isFetchingNextPage}
            onClick={() => webhooksQuery.fetchNextPage()}
          >
            {webhooksQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </main>
    </AppShell>
  );
}
