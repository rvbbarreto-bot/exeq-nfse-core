import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PortalPage } from "../components/PortalPage.js";
import { PortalPageHeader } from "../components/PortalPageHeader.js";
import { buildChargeDashboardKpis } from "../lib/charge-dashboard.js";
import { buildDashboardKpis, topStatusBreakdown } from "../lib/dashboard.js";
import {
  buildOpsAlertCards,
  hasActiveAlerts,
  hypercareAlertTotal,
} from "../lib/ops-alerts.js";
import {
  formatAmountCents,
  formatIssueStatus,
  formatMunicipio,
  issueStatusClass,
} from "../lib/issue-ui.js";
import { getToken } from "../lib/auth.js";

export function DashboardPage() {
  const token = getToken()!;

  const summaryQuery = useQuery({
    queryKey: ["ops-summary"],
    queryFn: () => api.getOpsSummary(token),
  });

  const recentQuery = useQuery({
    queryKey: ["issues-recent"],
    queryFn: () => api.listIssues(token, { limit: "8" }),
  });

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => api.getHealth(),
  });

  const stats = summaryQuery.data?.issue_stats;
  const chargeStats = summaryQuery.data?.charge_stats;
  const alerts = summaryQuery.data?.alerts;
  const kpis = stats ? buildDashboardKpis(stats) : [];
  const breakdown = stats ? topStatusBreakdown(stats) : [];
  const chargeKpis = chargeStats ? buildChargeDashboardKpis(chargeStats) : [];
  const alertCards = alerts ? buildOpsAlertCards(alerts) : [];
  const showAlerts = alerts && hasActiveAlerts(alerts);
  const hypercareTotal = alerts ? hypercareAlertTotal(alerts) : 0;

  const gatewayBadge = healthQuery.data?.gateway ? (
    <span
      className={`pill ${healthQuery.data.gateway.mock ? "warn" : "ok"}`}
      data-testid="gateway-integration-badge"
      title={healthQuery.data.gateway.base_url}
    >
      Gateway: {healthQuery.data.gateway.mock ? "Mock" : "HTTP"}
      {healthQuery.data.gateway.sync_processing ? " · sync" : ""}
    </span>
  ) : null;

  return (
    <AppShell>
      <PortalPage testId="page-dashboard" variant="dashboard">
        <PortalPageHeader
          title="Dashboard operacional"
          description="Emissao NFS-e, cobranca e triagem hypercare — indicadores consolidados do tenant."
          actions={
            <>
              {gatewayBadge}
              <Link to="/issues" className="btn-portal-primary">
                Emissoes
              </Link>
              <Link to="/charges" className="btn-portal-primary">
                Cobrancas
              </Link>
              <Link to="/das/guias" className="btn-portal-primary">
                Guias DAS
              </Link>
            </>
          }
        />

        {summaryQuery.isLoading && <p className="muted">Carregando metricas…</p>}
        {summaryQuery.error && <p className="error">Erro ao carregar dashboard</p>}

        {alerts && (
          <section className="dash-panel" data-testid="dashboard-hypercare">
            <h2 className="dash-panel__title">Hypercare — triagem operacional</h2>
            <p className="dash-panel__sub">
              {showAlerts
                ? `${hypercareTotal} item(ns) para revisar — clique para abrir a lista filtrada.`
                : "Nenhum alerta ativo no momento."}
            </p>
            <div className="dash-kpi-grid">
              {alertCards.map((card) => (
                <div
                  key={card.key}
                  className={`dash-kpi ${card.value === 0 ? "muted-kpi" : ""}`}
                  data-testid={`hypercare-alert-${card.key}`}
                >
                  <p className="dash-kpi__label">{card.label}</p>
                  <p className="dash-kpi__value">{card.value}</p>
                  {card.value > 0 ? (
                    <>
                      <span className={`dash-kpi__badge dash-kpi__badge--${card.severity === "critical" ? "red" : "orange"}`}>
                        Revisar
                      </span>
                      <Link to={card.href} className="fiscal-dash__all-link">
                        Ver lista
                      </Link>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}

        {stats && (
          <>
            <div className="dash-kpi-grid">
              {kpis.map((kpi) => (
                <div key={kpi.key} className={`dash-kpi ${kpi.hint ?? ""}`}>
                  <p className="dash-kpi__label">{kpi.label}</p>
                  <p className="dash-kpi__value">{kpi.value}</p>
                </div>
              ))}
            </div>

            {chargeStats && (
              <div className="dash-kpi-grid">
                {chargeKpis.map((kpi) => (
                  <div key={kpi.key} className={`dash-kpi ${kpi.hint ?? ""}`}>
                    <p className="dash-kpi__label">{kpi.label}</p>
                    <p className="dash-kpi__value">{kpi.value}</p>
                    {kpi.filterStatus ? (
                      <Link to={`/charges?status=${kpi.filterStatus}`} className="fiscal-dash__all-link">
                        Ver lista
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <div className="dash-mid">
              <section className="dash-panel">
                <h2 className="dash-panel__title">Emissoes por status</h2>
                <ul className="fiscal-dash__list">
                  {breakdown.map((row) => (
                    <li key={row.status} className="fiscal-dash__list-item">
                      <span className="fiscal-dash__list-link">
                        <span className="fiscal-dash__list-main">
                          <span className={`pill ${issueStatusClass(row.status)}`}>
                            {formatIssueStatus(row.status)}
                          </span>
                        </span>
                        <strong>{row.count}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="dash-panel">
                <h2 className="dash-panel__title">Municipios piloto</h2>
                <ul className="fiscal-dash__list">
                  {stats.pilot_municipios.map((m) => (
                    <li key={m.ibge_code} className="fiscal-dash__list-item">
                      <span className="fiscal-dash__list-link">
                        <span className="fiscal-dash__list-main">{m.label}</span>
                        <strong>{m.count}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="dash-panel">
              <h2 className="dash-panel__title">Emissoes recentes</h2>
              {recentQuery.isLoading && <p className="muted">Carregando…</p>}
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Municipio</th>
                    <th>Valor</th>
                    <th>Criada em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuery.data?.items.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <span className={`pill ${issueStatusClass(issue.status)}`}>
                          {formatIssueStatus(issue.status)}
                        </span>
                      </td>
                      <td>{formatMunicipio(issue.ibge_code)}</td>
                      <td>{formatAmountCents(issue.amount_cents)}</td>
                      <td>{new Date(issue.created_at).toLocaleString("pt-BR")}</td>
                      <td>
                        <Link to={`/issues/${issue.id}`}>Detalhe</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link to="/issues" className="fiscal-dash__all-link">
                Ver todas as emissoes
              </Link>
            </section>
          </>
        )}
      </PortalPage>
    </AppShell>
  );
}
