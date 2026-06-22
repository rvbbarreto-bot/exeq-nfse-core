import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PortalPage } from "../components/PortalPage.js";
import { PortalPageHeader } from "../components/PortalPageHeader.js";
import { canRunFiscalBackfill, type BackfillSnapshotsResult } from "../lib/fiscal-backfill-ui.js";
import { getToken } from "../lib/auth.js";

export function BackfillSnapshotsPage() {
  const token = getToken()!;
  const allowed = canRunFiscalBackfill();
  const [days, setDays] = useState(90);
  const [limit, setLimit] = useState(5000);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<BackfillSnapshotsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.backfillTaxSnapshots(token, { days, limit, dry_run: dryRun }),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err: unknown) => {
      setResult(null);
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "message" in err.body) {
        setError(String((err.body as { message: string }).message));
        return;
      }
      setError("Nao foi possivel executar o backfill.");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allowed) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <AppShell>
      <PortalPage testId="page-fiscal-backfill">
        <PortalPageHeader
          title="Backfill tax snapshot"
          description="Preenche snapshots fiscais para emissoes autorizadas sem tax_snapshot_id (RFC-0020)."
        />

        {!allowed ? (
          <p className="error" role="alert">
            Acesso restrito a tenant_admin.
          </p>
        ) : (
          <section className="dash-panel" data-testid="fiscal-backfill-form">
            <h2 className="dash-panel__title">Executar backfill</h2>
            <p className="muted">
              Use dry-run primeiro para contar candidatos. Apply grava snapshots append-only em{" "}
              <code>exeq_fiscal.tax_snapshot</code>.
            </p>
            <form onSubmit={onSubmit} className="grid filter-grid">
              <label>
                Janela (dias)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  data-testid="backfill-days"
                  required
                />
              </label>
              <label>
                Limite
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  data-testid="backfill-limit"
                  required
                />
              </label>
              <label className="filter-actions">
                <span>Dry-run (simular)</span>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  data-testid="backfill-dry-run"
                />
              </label>
              <div className="filter-actions">
                <button type="submit" className="btn-portal-primary" disabled={mutation.isPending}>
                  {mutation.isPending ? "Executando…" : dryRun ? "Simular backfill" : "Aplicar backfill"}
                </button>
              </div>
            </form>
            {error ? <p className="error">{error}</p> : null}
            {result ? (
              <dl className="detail-list" data-testid="backfill-result">
                <div>
                  <dt>Tenant</dt>
                  <dd>{result.tenant_slug ?? result.tenant_id}</dd>
                </div>
                <div>
                  <dt>Janela</dt>
                  <dd>{result.days} dias</dd>
                </div>
                <div>
                  <dt>Candidatos</dt>
                  <dd>{result.candidates}</dd>
                </div>
                <div>
                  <dt>Criados</dt>
                  <dd>{result.created}</dd>
                </div>
                <div>
                  <dt>Ignorados</dt>
                  <dd>{result.skipped}</dd>
                </div>
                <div>
                  <dt>Erros</dt>
                  <dd>{result.errors}</dd>
                </div>
                <div>
                  <dt>Modo</dt>
                  <dd>{result.dry_run ? "Dry-run" : "Apply"}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        )}
      </PortalPage>
    </AppShell>
  );
}
