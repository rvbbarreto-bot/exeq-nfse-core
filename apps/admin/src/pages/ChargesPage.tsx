import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PortalPage } from "../components/PortalPage.js";
import { PortalPageHeader } from "../components/PortalPageHeader.js";
import { getToken } from "../lib/auth.js";
import {
  buildChargesQuery,
  chargeStatusClass,
  FILTER_CHARGE_STATUS_OPTIONS,
  formatChargeStatus,
  truncateId,
} from "../lib/charge-ui.js";
import { downloadCsvExport } from "../lib/export-download.js";
import { formatAmountCents } from "../lib/issue-ui.js";

export function ChargesPage() {
  const token = getToken()!;
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [correlationId, setCorrelationId] = useState(searchParams.get("correlation_id") ?? "");
  const [idempotencyKey, setIdempotencyKey] = useState(searchParams.get("idempotency_key") ?? "");

  const filterKey = `${status}|${correlationId}|${idempotencyKey}`;

  const chargesQuery = useInfiniteQuery({
    queryKey: ["charges", filterKey],
    queryFn: ({ pageParam }) =>
      api.listCharges(
        token,
        buildChargesQuery({
          status,
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          limit: "50",
          cursor: pageParam,
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const items = chargesQuery.data?.pages.flatMap((p) => p.items) ?? [];

  function applyStatusFilter() {
    const next = new URLSearchParams();
    if (status) next.set("status", status);
    if (correlationId) next.set("correlation_id", correlationId);
    if (idempotencyKey) next.set("idempotency_key", idempotencyKey);
    setSearchParams(next);
    void chargesQuery.refetch();
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const q = buildChargesQuery({ status, correlation_id: correlationId, idempotency_key: idempotencyKey });
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsvExport("/v1/charges/export", token, q, `cobrancas-${date}.csv`);
    } catch {
      setExportError("Falha ao exportar CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <PortalPage testId="page-charges">
        <PortalPageHeader
          title="Cobrancas"
          description="Gateway de cobranca — status, correlation ID e exportacao CSV."
        />

        <section className="dash-panel filters">
          <div className="grid filter-grid">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {FILTER_CHARGE_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Correlation ID
              <input
                type="text"
                placeholder="uuid"
                value={correlationId}
                onChange={(e) => setCorrelationId(e.target.value)}
              />
            </label>
            <label>
              Idempotency key
              <input
                type="text"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
              />
            </label>
          </div>
          <div className="filter-actions">
            <button type="button" onClick={applyStatusFilter}>
              Aplicar filtros
            </button>
            <button type="button" className="btn-ghost" disabled={exporting} onClick={exportCsv}>
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
          {exportError && <p className="error">{exportError}</p>}
        </section>

        {chargesQuery.isLoading && <p>Carregando cobranças...</p>}
        {chargesQuery.error && <p className="error">Erro ao listar cobranças</p>}

        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>ID</th>
              <th>Tomador</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>NF vinculada</th>
              <th>Criada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((charge) => (
              <tr key={charge.id}>
                <td>
                  <span className={`pill ${chargeStatusClass(charge.status)}`}>
                    {formatChargeStatus(charge.status)}
                  </span>
                </td>
                <td className="mono muted" title={charge.id}>
                  {truncateId(charge.id)}
                </td>
                <td className="mono muted" title={charge.customer_id}>
                  {truncateId(charge.customer_id)}
                </td>
                <td>{formatAmountCents(charge.amount_cents)}</td>
                <td>{charge.due_date}</td>
                <td>
                  {charge.nf_issue_id ? (
                    <Link to={`/issues/${charge.nf_issue_id}`} className="mono">
                      {truncateId(charge.nf_issue_id)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{new Date(charge.created_at).toLocaleString("pt-BR")}</td>
                <td>
                  <Link to={`/charges/${charge.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!chargesQuery.isLoading && items.length === 0 && (
          <p className="muted">Nenhuma cobrança encontrada.</p>
        )}

        {chargesQuery.hasNextPage && (
          <button
            type="button"
            className="btn-ghost"
            disabled={chargesQuery.isFetchingNextPage}
            onClick={() => chargesQuery.fetchNextPage()}
          >
            {chargesQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </PortalPage>
    </AppShell>
  );
}
