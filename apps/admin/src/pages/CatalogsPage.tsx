import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { getToken } from "../lib/auth.js";
import { formatCatalogStatus } from "../lib/catalog-ui.js";

export function CatalogsPage() {
  const token = getToken()!;
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["catalogs"],
    queryFn: () => api.listCatalogs(token),
  });

  const createDraft = useMutation({
    mutationFn: () => api.createDraftCatalog(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalogs"] }),
  });

  return (
    <AppShell>
      <main className="page">
        <div className="row">
          <h1>Catalogos fiscais</h1>
          <button type="button" onClick={() => createDraft.mutate()} disabled={createDraft.isPending}>
            Novo rascunho
          </button>
        </div>
        {isLoading && <p>Carregando...</p>}
        {error && <p className="error">Erro ao carregar catalogos</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Versao</th>
              <th>Status</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td>v{c.version}</td>
                <td>{formatCatalogStatus(c.status)}</td>
                <td>{new Date(c.created_at).toLocaleString("pt-BR")}</td>
                <td>
                  <Link to={`/catalogs/${c.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </AppShell>
  );
}
