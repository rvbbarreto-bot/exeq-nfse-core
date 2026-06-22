import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PortalPage } from "../components/PortalPage.js";
import { PortalPageHeader } from "../components/PortalPageHeader.js";
import { ResponsiveTable } from "../components/ResponsiveTable.js";
import {
  buildIssuesQuery,
  FILTER_STATUS_OPTIONS,
  formatAmountCents,
  formatIssueStatus,
  formatMunicipio,
  issueStatusClass,
  PILOT_MUNICIPIOS,
} from "../lib/issue-ui.js";
import { getToken } from "../lib/auth.js";
import { downloadCsvExport } from "../lib/export-download.js";

export function IssuesPage() {
  const token = getToken()!;
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [ibgeCode, setIbgeCode] = useState(searchParams.get("ibge_code") ?? "");
  const [fromDate, setFromDate] = useState(searchParams.get("from_date") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to_date") ?? "");
  const [correlationId, setCorrelationId] = useState(searchParams.get("correlation_id") ?? "");
  const [idempotencyKey, setIdempotencyKey] = useState(searchParams.get("idempotency_key") ?? "");

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        status,
        ibge_code: ibgeCode,
        from_date: fromDate,
        to_date: toDate,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
      }),
    [status, ibgeCode, fromDate, toDate, correlationId, idempotencyKey],
  );

  const issuesQuery = useInfiniteQuery({
    queryKey: ["issues", filterKey],
    queryFn: ({ pageParam }) =>
      api.listIssues(
        token,
        buildIssuesQuery({
          status,
          ibge_code: ibgeCode,
          from_date: fromDate,
          to_date: toDate,
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          cursor: pageParam,
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const items = issuesQuery.data?.pages.flatMap((p) => p.items) ?? [];

  function applyFilters() {
    const next = new URLSearchParams();
    if (status) next.set("status", status);
    if (ibgeCode) next.set("ibge_code", ibgeCode);
    if (fromDate) next.set("from_date", fromDate);
    if (toDate) next.set("to_date", toDate);
    if (correlationId) next.set("correlation_id", correlationId);
    if (idempotencyKey) next.set("idempotency_key", idempotencyKey);
    setSearchParams(next);
    void issuesQuery.refetch();
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const q = buildIssuesQuery({
        status,
        ibge_code: ibgeCode,
        from_date: fromDate,
        to_date: toDate,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
      });
      const date = new Date().toISOString().slice(0, 10);
      await downloadCsvExport("/v1/nf/issues/export", token, q, `emissoes-nfse-${date}.csv`);
    } catch {
      setExportError("Falha ao exportar CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <PortalPage testId="page-issues">
        <PortalPageHeader
          title="Emissoes NFS-e"
          description="Listagem paginada com filtros por status, municipio piloto e periodo."
        />

        <section className="dash-panel filters">
          <div className="grid filter-grid">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {FILTER_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Municipio
              <select
                data-testid="filter-municipio"
                value={ibgeCode}
                onChange={(e) => setIbgeCode(e.target.value)}
              >
                <option value="">Todos</option>
                {PILOT_MUNICIPIOS.map((m) => (
                  <option key={m.ibge_code} value={m.ibge_code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              De
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label>
              Ate
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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
            <button type="button" onClick={applyFilters}>
              Aplicar filtros
            </button>
            <button type="button" className="btn-ghost" disabled={exporting} onClick={exportCsv}>
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
          {exportError && <p className="error">{exportError}</p>}
        </section>

        {issuesQuery.isLoading && <p>Carregando emissoes...</p>}
        {issuesQuery.error && <p className="error">Erro ao listar emissoes</p>}

        <ResponsiveTable caption="Emissoes NFS-e" label="Tabela de emissoes">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Municipio</th>
              <th>Competencia</th>
              <th>Valor</th>
              <th>Focus ref</th>
              <th>Criada em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((issue) => (
              <tr key={issue.id}>
                <td>
                  <span className={`pill ${issueStatusClass(issue.status)}`}>
                    {formatIssueStatus(issue.status)}
                  </span>
                </td>
                <td>{formatMunicipio(issue.ibge_code)}</td>
                <td>{issue.competence_date}</td>
                <td>{formatAmountCents(issue.amount_cents)}</td>
                <td className="mono muted">{issue.focus_ref ?? "—"}</td>
                <td>{new Date(issue.created_at).toLocaleString("pt-BR")}</td>
                <td>
                  <Link to={`/issues/${issue.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </ResponsiveTable>

        {!issuesQuery.isLoading && items.length === 0 && (
          <p className="muted">Nenhuma emissao encontrada com os filtros atuais.</p>
        )}

        {issuesQuery.hasNextPage && (
          <button
            type="button"
            className="btn-ghost"
            disabled={issuesQuery.isFetchingNextPage}
            onClick={() => issuesQuery.fetchNextPage()}
          >
            {issuesQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </PortalPage>
    </AppShell>
  );
}
