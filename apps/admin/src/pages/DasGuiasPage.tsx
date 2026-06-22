import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { EmitDasGuiaInput, TipoGuia } from "@exeq/shared";
import { api, ApiError } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PortalPage } from "../components/PortalPage.js";
import { PortalPageHeader } from "../components/PortalPageHeader.js";
import { getToken } from "../lib/auth.js";
import {
  buildDasGuiasQuery,
  canEmitDasGuia,
  defaultCompetenciaMonth,
  FILTER_GUIA_STATUS_OPTIONS,
  FILTER_TIPO_GUIA_OPTIONS,
  formatCompetencia,
  formatCurrencyBrl,
  formatGuiaStatus,
  formatTipoGuia,
  guiaStatusClass,
  truncateId,
} from "../lib/das-ui.js";

export function DasGuiasPage() {
  const token = getToken()!;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [tipoGuia, setTipoGuia] = useState(searchParams.get("tipo_guia") ?? "");
  const [competencia, setCompetencia] = useState(searchParams.get("competencia") ?? "");
  const [providerId, setProviderId] = useState(searchParams.get("provider_id") ?? "");

  const [emitOpen, setEmitOpen] = useState(false);
  const [emitTipo, setEmitTipo] = useState<TipoGuia>("DAS");
  const [emitProviderId, setEmitProviderId] = useState("");
  const [emitCompetencia, setEmitCompetencia] = useState(defaultCompetenciaMonth());
  const [emitCodigoReceita, setEmitCodigoReceita] = useState("");
  const [emitPeriodoApuracao, setEmitPeriodoApuracao] = useState("");
  const [emitError, setEmitError] = useState<string | null>(null);

  const filterKey = useMemo(
    () => JSON.stringify({ status, tipo_guia: tipoGuia, competencia, provider_id: providerId }),
    [status, tipoGuia, competencia, providerId],
  );

  const guiasQuery = useInfiniteQuery({
    queryKey: ["das-guias", filterKey],
    queryFn: ({ pageParam }) =>
      api.listDasGuias(
        token,
        buildDasGuiasQuery({
          status,
          tipo_guia: tipoGuia,
          competencia,
          provider_id: providerId,
          limit: "50",
          cursor: pageParam,
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.listProviders(token),
  });

  const emitMutation = useMutation({
    mutationFn: (body: EmitDasGuiaInput) => api.emitDasGuia(token, body),
    onSuccess: (data) => {
      setEmitError(null);
      setEmitOpen(false);
      void qc.invalidateQueries({ queryKey: ["das-guias"] });
      navigate(`/das/guias/${data.guia.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === "object") {
        const guiaId = "guia_id" in err.body ? String((err.body as { guia_id: string }).guia_id) : null;
        if (guiaId) {
          navigate(`/das/guias/${guiaId}`);
          return;
        }
      }
      const message =
        err instanceof ApiError &&
        err.body &&
        typeof err.body === "object" &&
        err.body !== null &&
        "message" in err.body
          ? String((err.body as { message: string }).message)
          : "Nao foi possivel emitir a guia.";
      setEmitError(message);
    },
  });

  const items = guiasQuery.data?.pages.flatMap((p) => p.guias) ?? [];
  const providers = providersQuery.data?.items ?? [];

  function applyFilters() {
    const next = new URLSearchParams();
    if (status) next.set("status", status);
    if (tipoGuia) next.set("tipo_guia", tipoGuia);
    if (competencia) next.set("competencia", competencia);
    if (providerId) next.set("provider_id", providerId);
    setSearchParams(next);
    void guiasQuery.refetch();
  }

  function submitEmit(e: React.FormEvent) {
    e.preventDefault();
    setEmitError(null);
    if (!emitProviderId) {
      setEmitError("Selecione o prestador.");
      return;
    }
    const body: EmitDasGuiaInput = {
      provider_id: emitProviderId,
      tipo_guia: emitTipo,
      competencia: emitCompetencia,
      idempotency_key: crypto.randomUUID(),
    };
    if (emitTipo === "DARF") {
      body.codigo_receita = emitCodigoReceita.trim();
      body.periodo_apuracao = emitPeriodoApuracao;
    }
    emitMutation.mutate(body);
  }

  return (
    <AppShell>
      <PortalPage testId="page-das-guias">
        <PortalPageHeader
          title="Guias DAS / DARF"
          description="Emissao via gateway Receita (mock ou HTTP) e consulta de guias por competencia."
          actions={
            canEmitDasGuia() ? (
              <button type="button" className="btn-portal-primary" onClick={() => setEmitOpen((v) => !v)}>
                {emitOpen ? "Fechar emissao" : "Emitir guia"}
              </button>
            ) : null
          }
        />

        {emitOpen && canEmitDasGuia() ? (
          <section className="dash-panel" data-testid="das-emit-form">
            <h2 className="dash-panel__title">Emitir guia fiscal</h2>
            <form onSubmit={submitEmit} className="grid filter-grid">
              <label>
                Prestador
                <select
                  value={emitProviderId}
                  onChange={(e) => setEmitProviderId(e.target.value)}
                  required
                >
                  <option value="">Selecione…</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.legal_name} ({p.document})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select value={emitTipo} onChange={(e) => setEmitTipo(e.target.value as TipoGuia)}>
                  <option value="DAS">DAS</option>
                  <option value="DARF">DARF</option>
                </select>
              </label>
              <label>
                Competencia
                <input
                  type="month"
                  value={emitCompetencia}
                  onChange={(e) => setEmitCompetencia(e.target.value)}
                  required
                />
              </label>
              {emitTipo === "DARF" ? (
                <>
                  <label>
                    Codigo receita
                    <input
                      type="text"
                      value={emitCodigoReceita}
                      onChange={(e) => setEmitCodigoReceita(e.target.value)}
                      placeholder="ex.: 0561"
                      required
                    />
                  </label>
                  <label>
                    Periodo apuracao
                    <input
                      type="date"
                      value={emitPeriodoApuracao}
                      onChange={(e) => setEmitPeriodoApuracao(e.target.value)}
                      required
                    />
                  </label>
                </>
              ) : null}
              <div className="filter-actions">
                <button type="submit" disabled={emitMutation.isPending}>
                  {emitMutation.isPending ? "Emitindo…" : "Emitir"}
                </button>
              </div>
            </form>
            {emitError ? <p className="error">{emitError}</p> : null}
          </section>
        ) : null}

        <section className="dash-panel filters">
          <div className="grid filter-grid">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {FILTER_GUIA_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select value={tipoGuia} onChange={(e) => setTipoGuia(e.target.value)}>
                {FILTER_TIPO_GUIA_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Competencia
              <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
            </label>
            <label>
              Prestador
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                <option value="">Todos</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.legal_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={applyFilters}>
            Filtrar
          </button>
        </section>

        {guiasQuery.isLoading && <p>Carregando guias…</p>}
        {guiasQuery.error && <p className="error">Falha ao carregar guias.</p>}

        <section className="dash-panel">
          <table className="table">
            <thead>
              <tr>
                <th>Competencia</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Valor total</th>
                <th>Vencimento</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !guiasQuery.isLoading ? (
                <tr>
                  <td colSpan={6}>Nenhuma guia encontrada.</td>
                </tr>
              ) : (
                items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link to={`/das/guias/${g.id}`}>{formatCompetencia(g.competencia)}</Link>
                    </td>
                    <td>{formatTipoGuia(g.tipo_guia)}</td>
                    <td>
                      <span className={`pill ${guiaStatusClass(g.status)}`}>
                        {formatGuiaStatus(g.status)}
                      </span>
                    </td>
                    <td>{formatCurrencyBrl(g.valor_total)}</td>
                    <td>{g.data_vencimento ?? "—"}</td>
                    <td className="mono">{truncateId(g.id)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {guiasQuery.hasNextPage ? (
            <button type="button" disabled={guiasQuery.isFetchingNextPage} onClick={() => void guiasQuery.fetchNextPage()}>
              {guiasQuery.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </button>
          ) : null}
        </section>
      </PortalPage>
    </AppShell>
  );
}
