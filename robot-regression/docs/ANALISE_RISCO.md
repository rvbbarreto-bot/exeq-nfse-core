# Análise de risco — Regressão Exeq Admin

## ALTO RISCO

| Área | Risco | Cobertura Robot |
|------|-------|-----------------|
| Autenticação / sessão | Token inválido, redirect incorreto | `10_auth_session.robot`, `99_console_network_deep.robot` |
| Emissão NFS-e 4 municípios | Filtro errado, Barueri visível | `30_issues_pilot_filters.robot` |
| Cobrança + gateway | Status/registrada, mock, sandbox link | `40_charges_gateway.robot` |
| API stats piloto | Regressão para 3 IBGE | `01_smoke_critical.robot` SMOKE-04 |
| Console / JS runtime | Erros silenciosos pós deploy | `99_console_network_deep.robot` |

## MÉDIO RISCO

| Área | Risco | Cobertura |
|------|-------|-----------|
| Dashboard hypercare | Links quebrados, métricas vazias | `20_navigation_modules.robot` |
| Webhooks inbox | Filtro/export falha | `50_webhooks_catalogs.robot` |
| Catálogos | Lista vazia / erro load | `50_webhooks_catalogs.robot` |
| Criar cobrança na emissão | Timeout UI | `40_charges_gateway.robot` REG-CHG-03 |
| Tax resolve | Catálogo 3547809 ausente | `30_issues_pilot_filters.robot` REG-ISS-04 |

## BAIXO RISCO

| Área | Risco | Cobertura |
|------|-------|-----------|
| Brand link | Navegação cosmética | REG-NAV-02 |
| Wildcard route | Redirect SPA | REG-DEEP-03 |
| Paginação “Carregar mais” | Dados homolog | Exploratório manual |
| Upload CSV catálogo | Fluxo contador | Fora smoke — expandir sprint futura |

---

**Prioridade de execução CI/local:** Smoke → Auth → Issues → Charges → Deep.
