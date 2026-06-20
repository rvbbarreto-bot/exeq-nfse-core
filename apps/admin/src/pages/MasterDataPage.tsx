import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { getToken } from "../lib/auth.js";

type Tab = "providers" | "customers" | "services";

export function MasterDataPage() {
  const token = getToken()!;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("providers");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.listProviders(token),
    enabled: tab === "providers",
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => api.listCustomers(token),
    enabled: tab === "customers",
  });
  const services = useQuery({
    queryKey: ["services"],
    queryFn: () => api.listServices(token),
    enabled: tab === "services",
  });

  const createProvider = useMutation({
    mutationFn: (body: Parameters<typeof api.createProvider>[1]) => api.createProvider(token, body),
    onSuccess: () => {
      setMessage("Prestador criado.");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: () => setError("Falha ao criar prestador."),
  });

  const createCustomer = useMutation({
    mutationFn: (body: Parameters<typeof api.createCustomer>[1]) => api.createCustomer(token, body),
    onSuccess: () => {
      setMessage("Tomador criado.");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: () => setError("Falha ao criar tomador."),
  });

  const createService = useMutation({
    mutationFn: (body: Parameters<typeof api.createService>[1]) => api.createService(token, body),
    onSuccess: () => {
      setMessage("Servico criado.");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: () => setError("Falha ao criar servico."),
  });

  return (
    <AppShell>
      <main className="page" data-testid="page-master-data">
        <h1>Cadastros</h1>
        <p className="muted">Prestadores, tomadores e servicos para emissao NFS-e e canal WhatsApp.</p>

        <div className="tabs" role="tablist">
          {(
            [
              ["providers", "Prestadores"],
              ["customers", "Tomadores"],
              ["services", "Servicos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMessage(null);
                setError(null);
              }}
              data-testid={`tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>

        {message ? <p className="ok-banner">{message}</p> : null}
        {error ? <p className="error-banner">{error}</p> : null}

        {tab === "providers" ? (
          <section className="card">
            <h2>Novo prestador</h2>
            <form
              className="grid filter-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createProvider.mutate({
                  document: String(fd.get("document")).replace(/\D/g, ""),
                  legal_name: String(fd.get("legal_name")),
                  tax_regime: "simples_nacional",
                  municipal_registration: String(fd.get("municipal_registration") || "") || undefined,
                });
                e.currentTarget.reset();
              }}
            >
              <label>
                CNPJ
                <input name="document" required pattern="\d{14}" placeholder="14 digitos" />
              </label>
              <label>
                Razao social
                <input name="legal_name" required minLength={2} />
              </label>
              <label>
                IM
                <input name="municipal_registration" />
              </label>
              <button type="submit" className="btn-primary" disabled={createProvider.isPending}>
                Criar prestador
              </button>
            </form>
            <h3>Lista</h3>
            {providers.isLoading ? <p>Carregando…</p> : null}
            <table>
              <thead>
                <tr>
                  <th>CNPJ</th>
                  <th>Nome</th>
                  <th>Regime</th>
                </tr>
              </thead>
              <tbody>
                {providers.data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.document}</td>
                    <td>{p.legal_name}</td>
                    <td>{p.tax_regime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {tab === "customers" ? (
          <section className="card">
            <h2>Novo tomador</h2>
            <form
              className="grid filter-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createCustomer.mutate({
                  document: String(fd.get("document")).replace(/\D/g, ""),
                  name: String(fd.get("name")),
                  email: String(fd.get("email") || "") || undefined,
                });
                e.currentTarget.reset();
              }}
            >
              <label>
                CPF/CNPJ
                <input name="document" required placeholder="11 ou 14 digitos" />
              </label>
              <label>
                Nome
                <input name="name" required minLength={2} />
              </label>
              <label>
                E-mail
                <input name="email" type="email" />
              </label>
              <button type="submit" className="btn-primary" disabled={createCustomer.isPending}>
                Criar tomador
              </button>
            </form>
            <h3>Lista</h3>
            {customers.isLoading ? <p>Carregando…</p> : null}
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Nome</th>
                </tr>
              </thead>
              <tbody>
                {customers.data?.items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.document}</td>
                    <td>{c.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {tab === "services" ? (
          <section className="card">
            <h2>Novo servico</h2>
            <form
              className="grid filter-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createService.mutate({
                  service_code: String(fd.get("service_code")),
                  description: String(fd.get("description")),
                  lc116_item: String(fd.get("service_code")),
                });
                e.currentTarget.reset();
              }}
            >
              <label>
                Codigo
                <input name="service_code" required placeholder="1.01" />
              </label>
              <label>
                Descricao
                <input name="description" required minLength={2} />
              </label>
              <button type="submit" className="btn-primary" disabled={createService.isPending}>
                Criar servico
              </button>
            </form>
            <h3>Lista</h3>
            {services.isLoading ? <p>Carregando…</p> : null}
            <table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Descricao</th>
                </tr>
              </thead>
              <tbody>
                {services.data?.items.map((s) => (
                  <tr key={s.id}>
                    <td>{s.service_code}</td>
                    <td>{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
