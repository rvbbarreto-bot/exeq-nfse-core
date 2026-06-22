import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PortalPage } from "../components/PortalPage.js";
import { PortalPageHeader } from "../components/PortalPageHeader.js";
import { getToken } from "../lib/auth.js";
import {
  formatCompetencia,
  formatComplianceStatus,
  formatCurrencyBrl,
  formatDateBr,
  formatGuiaStatus,
  formatTipoGuia,
  guiaStatusClass,
} from "../lib/das-ui.js";

export function DasGuiaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = getToken()!;
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const guiaQuery = useQuery({
    queryKey: ["das-guia", id],
    queryFn: () => api.getDasGuia(token, id!),
    enabled: Boolean(id),
  });

  const guia = guiaQuery.data?.guia;

  async function copyText(label: string, value: string | null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyMsg(`${label} copiado.`);
      setTimeout(() => setCopyMsg(null), 2500);
    } catch {
      setCopyMsg(`Nao foi possivel copiar ${label.toLowerCase()}.`);
    }
  }

  return (
    <AppShell>
      <PortalPage testId="page-das-guia-detail">
        <p>
          <Link to="/das/guias">← Voltar para guias</Link>
        </p>
        {guiaQuery.isLoading && <p>Carregando…</p>}
        {guiaQuery.error && <p className="error">Guia nao encontrada.</p>}
        {copyMsg ? <p className="ok">{copyMsg}</p> : null}

        {guia ? (
          <>
            <PortalPageHeader
              title={`${formatTipoGuia(guia.tipo_guia)} — ${formatCompetencia(guia.competencia)}`}
              actions={
                <span className={`pill ${guiaStatusClass(guia.status)}`}>{formatGuiaStatus(guia.status)}</span>
              }
            />

            <div className="dash-mid">
              <article className="dash-panel">
                <h2 className="dash-panel__title">Valores</h2>
                <dl className="detail-list">
                  <div>
                    <dt>Principal</dt>
                    <dd>{formatCurrencyBrl(guia.valor_principal)}</dd>
                  </div>
                  <div>
                    <dt>Multa</dt>
                    <dd>{formatCurrencyBrl(guia.valor_multa)}</dd>
                  </div>
                  <div>
                    <dt>Juros</dt>
                    <dd>{formatCurrencyBrl(guia.valor_juros)}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>
                      <strong>{formatCurrencyBrl(guia.valor_total)}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Vencimento</dt>
                    <dd>{formatDateBr(guia.data_vencimento)}</dd>
                  </div>
                </dl>
              </article>

              <article className="dash-panel">
                <h2 className="dash-panel__title">Compliance</h2>
                <dl className="detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>{formatComplianceStatus(guia.compliance_status)}</dd>
                  </div>
                  <div>
                    <dt>Motivo</dt>
                    <dd>{guia.compliance_motivo ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Versao</dt>
                    <dd>{guia.versao_atual}</dd>
                  </div>
                </dl>
              </article>
            </div>

            <section className="dash-panel">
              <h2 className="dash-panel__title">Pagamento</h2>
              <dl className="detail-list">
                <div>
                  <dt>Linha digitavel</dt>
                  <dd className="mono">{guia.linha_digitavel ?? "—"}</dd>
                  {guia.linha_digitavel ? (
                    <button type="button" onClick={() => void copyText("Linha digitavel", guia.linha_digitavel)}>
                      Copiar linha
                    </button>
                  ) : null}
                </div>
                <div>
                  <dt>PIX copia e cola</dt>
                  <dd className="mono">{guia.pix_copia_cola ?? "—"}</dd>
                  {guia.pix_copia_cola ? (
                    <button type="button" onClick={() => void copyText("PIX", guia.pix_copia_cola)}>
                      Copiar PIX
                    </button>
                  ) : null}
                </div>
              </dl>
            </section>

            <section className="dash-panel">
              <h2 className="dash-panel__title">Metadados</h2>
              <dl className="detail-list">
                <div>
                  <dt>ID</dt>
                  <dd className="mono">{guia.id}</dd>
                </div>
                <div>
                  <dt>Prestador</dt>
                  <dd className="mono">{guia.provider_id}</dd>
                </div>
                <div>
                  <dt>PDF storage</dt>
                  <dd className="mono">{guia.pdf_storage_key ?? "—"}</dd>
                </div>
                <div>
                  <dt>Criada em</dt>
                  <dd>{new Date(guia.created_at).toLocaleString("pt-BR")}</dd>
                </div>
                <div>
                  <dt>Atualizada em</dt>
                  <dd>{new Date(guia.updated_at).toLocaleString("pt-BR")}</dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}
      </PortalPage>
    </AppShell>
  );
}
