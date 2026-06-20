import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import {
  CsvImportFeedback,
  CsvImportPanel,
  type CsvImportResult,
  PublishChecklistPanel,
} from "../components/CatalogPanels.js";
import { getToken } from "../lib/auth.js";
import {
  canPublishCatalog,
  DEFAULT_PUBLISH_CHECKLIST,
  formatCatalogStatus,
  type PublishChecklist,
} from "../lib/catalog-ui.js";

export function CatalogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = getToken()!;
  const qc = useQueryClient();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["catalog", id],
    queryFn: () => api.getCatalog(token, id!),
    enabled: Boolean(id),
  });

  const rulesQuery = useQuery({
    queryKey: ["catalog-rules", id],
    queryFn: () => api.listRules(token, id!),
    enabled: Boolean(id),
  });

  const checklistQuery = useQuery({
    queryKey: ["catalog-checklist", id],
    queryFn: async () => {
      const res = await api.getPublishChecklist(token, id!);
      return res.checklist ?? DEFAULT_PUBLISH_CHECKLIST;
    },
    enabled: Boolean(id),
  });

  const updateChecklist = useMutation({
    mutationFn: (patch: Partial<PublishChecklist>) =>
      api.updatePublishChecklist(token, id!, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-checklist", id] });
      qc.invalidateQueries({ queryKey: ["catalog", id] });
    },
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) => api.importCsv(token, id!, csv),
    onSuccess: (res) => {
      setImportResult(res);
      const errCount = res.parse_errors.length + res.map_errors.length;
      setImportMsg(
        errCount > 0
          ? `Importacao parcial: ${res.imported} regras; ${errCount} erro(s) de linha.`
          : `Importadas ${res.imported} regras; ${res.skipped} ignoradas.`,
      );
      qc.invalidateQueries({ queryKey: ["catalog-rules", id] });
      qc.invalidateQueries({ queryKey: ["catalog-checklist", id] });
    },
    onError: () => {
      setImportResult(null);
      setImportMsg("Falha na importacao CSV.");
    },
  });

  const publish = useMutation({
    mutationFn: () => api.publishCatalog(token, id!),
    onSuccess: () => {
      setPublishMsg("Catalogo publicado com sucesso.");
      qc.invalidateQueries({ queryKey: ["catalog", id] });
      qc.invalidateQueries({ queryKey: ["catalogs"] });
    },
    onError: (err: unknown) => {
      const body = err && typeof err === "object" && "body" in err ? (err as { body: unknown }).body : null;
      const missing =
        body && typeof body === "object" && "missing" in body
          ? (body as { missing: string[] }).missing.join(", ")
          : null;
      setPublishMsg(missing ? `Gates pendentes: ${missing}` : "Nao foi possivel publicar.");
    },
  });

  const catalog = catalogQuery.data;
  const rules = rulesQuery.data?.items ?? [];
  const checklist = checklistQuery.data ?? DEFAULT_PUBLISH_CHECKLIST;
  const editable = catalog?.status === "draft";
  const publishPreview = canPublishCatalog(checklist, rules.length);

  return (
    <AppShell>
      <main className="page">
        <p>
          <Link to="/catalogs">← Voltar</Link>
      </p>
        {catalog && (
          <>
            <div className="row">
              <h1>
                Catalogo v{catalog.version} — {formatCatalogStatus(catalog.status)}
              </h1>
              {editable && (
                <button
                  type="button"
                  disabled={!publishPreview.ok || publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  Publicar
                </button>
              )}
            </div>
            {publishMsg && <p className={publish.isSuccess ? "ok" : "error"}>{publishMsg}</p>}
            {!publishPreview.ok && editable && (
              <p className="muted">Pendencias: {publishPreview.reasons.join("; ")}</p>
            )}

            <div className="grid">
              <CsvImportPanel
                disabled={!editable || importCsv.isPending}
                onImport={async (csv) => {
                  setImportMsg(null);
                  setImportResult(null);
                  return importCsv.mutateAsync(csv);
                }}
              />
              <PublishChecklistPanel
                checklist={checklist}
                editable={editable}
                onToggle={(key, value) => updateChecklist.mutate({ [key]: value })}
              />
            </div>
            <CsvImportFeedback message={importMsg} result={importResult} />

            <section className="card">
              <h2>Regras ({rules.length})</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>IBGE</th>
                    <th>Municipio</th>
                    <th>Servico</th>
                    <th>Regime</th>
                    <th>ISS</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.ibge_code}</td>
                      <td>
                        {r.municipio_nome}/{r.uf}
                      </td>
                      <td>
                        {r.service_code} — {r.service_description}
                      </td>
                      <td>{r.tax_regime}</td>
                      <td>{Number(r.iss_rate).toFixed(4)}</td>
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
