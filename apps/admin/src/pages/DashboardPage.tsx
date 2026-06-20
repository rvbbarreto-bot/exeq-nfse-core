import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
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

  return (
    <AppShell>
      <main className="page" data-testid="page-dashboard">
        <div className="row">
          <h1>Dashboard operacao</h1>
          <div className="row">
            <Link to="/issues">Emissoes</Link>
            <Link to="/charges">Cobrancas</Link>
          </div>
        </div>
        {summaryQuery.isLoading && <p>Carregando metricas...</p>}
        {summaryQuery.error && <p className="error">Erro ao carregar dashboard</p>}

        {healthQuery.data?.gateway && (
          <p
            className={`pill ${healthQuery.data.gateway.mock ? "warn" : "ok"}`}
            data-testid="gateway-integration-badge"
            title={healthQuery.data.gateway.base_url}
          >
            Gateway: {healthQuery.data.gateway.mock ? "Mock" : "HTTP"}
            {healthQuery.data.gateway.sync_processing ? " · sync" : ""}
          </p>
        )}

        {alerts && (
          <section className="card alert-banner" data-testid="dashboard-hypercare">
            <h2>Hypercare — triagem operacional</h2>
            <p className="muted">
              {showAlerts
                ? `${hypercareTotal} item(ns) para revisar — clique para abrir a lista filtrada.`
                : "Nenhum alerta ativo no momento."}
            </p>
            <div className="grid kpi-grid">
              {alertCards.map((card) => (
                <article
                  key={card.key}
                  className={`card kpi alert-${card.severity} ${card.value === 0 ? "muted-kpi" : ""}`}
                  data-testid={`hypercare-alert-${card.key}`}
                >
                  <p className="kpi-label">{card.label}</p>
                  <p className="kpi-value">{card.value}</p>
                  {card.value > 0 && <Link to={card.href}>Ver lista</Link>}
                </article>
              ))}
            </div>
          </section>
        )}

        {stats && (
          <>
            <section className="grid kpi-grid">
              {kpis.map((kpi) => (
                <article key={kpi.key} className={`card kpi ${kpi.hint ?? ""}`}>
                  <p className="kpi-label">{kpi.label}</p>
                  <p className="kpi-value">{kpi.value}</p>
                </article>
              ))}
            </section>

            {chargeStats && (
              <section className="grid kpi-grid">
                {chargeKpis.map((kpi) => (
                  <article key={kpi.key} className={`card kpi ${kpi.hint ?? ""}`}>
                    <p className="kpi-label">{kpi.label}</p>
                    <p className="kpi-value">{kpi.value}</p>
                    {kpi.filterStatus && (
                      <Link to={`/charges?status=${kpi.filterStatus}`}>Ver lista</Link>
                    )}
                  </article>
                ))}
              </section>
            )}

            <div className="grid two-col">
              <section className="card">
                <h2>Emissoes por status</h2>
                <ul className="stat-list">
                  {breakdown.map((row) => (
                    <li key={row.status}>
                      <span className={`pill ${issueStatusClass(row.status)}`}>
                        {formatIssueStatus(row.status)}
                      </span>
                      <strong>{row.count}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card">
                <h2>Municipios piloto</h2>
                <ul className="stat-list">
                  {stats.pilot_municipios.map((m) => (
                    <li key={m.ibge_code}>
                      <span>{m.label}</span>
                      <strong>{m.count}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="card">
              <h2>Emissoes recentes</h2>
              {recentQuery.isLoading && <p className="muted">Carregando...</p>}
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
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
