# Inventário técnico — Exeq Admin (Portal NFSe)

| Campo | Valor |
|-------|-------|
| **Aplicação** | Exeq Admin — SPA React (Vite) + React Router + TanStack Query |
| **URL homolog** | `http://127.0.0.1:5173` |
| **API** | `http://127.0.0.1:3002` |
| **Ambiente** | LOCAL / HOMOLOG |
| **Auth** | JWT em `localStorage` (`exeq_admin_token`) |
| **Credenciais padrão** | `admin@piloto.local` / `changeme` |

---

## Rotas

| Rota | Página | `data-testid` main |
|------|--------|-------------------|
| `/login` | Login | `login-email`, `login-password`, `login-submit` |
| `/` | Dashboard | `page-dashboard`, `dashboard-hypercare`, `gateway-integration-badge` |
| `/issues` | Emissões | `page-issues`, `filter-municipio` |
| `/issues/:id` | Detalhe emissão | `page-issue-detail`, `issue-municipio`, `issue-create-charge` |
| `/charges` | Cobranças | `page-charges` |
| `/charges/:id` | Detalhe cobrança | `page-charge-detail`, `charge-gateway`, `charge-gateway-sandbox-link` |
| `/webhooks` | Inbox webhooks | heading `Webhooks (inbox)` |
| `/catalogs` | Catálogos | heading `Catalogos fiscais` |
| `/catalogs/:id` | Detalhe catálogo | `catalog-publish-checklist`, `catalog-csv-import` |
| `*` | Redirect | → `/` se autenticado; `/login` se não |

---

## Menu (`AppShell`)

| Link | testid |
|------|--------|
| Dashboard | `nav-dashboard` |
| Emissões | `nav-issues` |
| Cobranças | `nav-charges` |
| Webhooks | `nav-webhooks` |
| Catálogos | `nav-catalogs` |
| Sair | botão texto `Sair` |

---

## APIs críticas (Bearer token)

| Método | Endpoint | Uso |
|--------|----------|-----|
| POST | `/v1/auth/login` | Login |
| GET | `/health` | Health gate |
| GET | `/v1/nf/issues/stats` | 4 municípios piloto |
| GET/POST | `/v1/nf/issues` | Emissões |
| POST | `/v1/tax/resolve` | Alíquota ISS |
| GET/POST | `/v1/charges` | Cobranças |
| GET | `/v1/webhooks/inbox` | Triagem webhooks |
| GET | `/v1/catalogs` | Catálogos fiscais |

---

## Escopo PO (4 IBGE operacionais)

| IBGE | Município |
|------|-----------|
| 3504107 | Atibaia |
| 3507605 | Bragança Paulista |
| 3528502 | Mairiporã |
| 3547809 | Santo André |

**Fora do escopo:** Barueri, Diadema (candidato apenas).

---

## Dependências de execução

1. API `:3002` + Postgres seed (`npm run db:seed`)
2. Admin `:5173` (`npm run dev` no workspace admin)
3. Variáveis opcionais: `ADMIN_BASE_URL`, `API_BASE_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`

---

*Gerado por engenharia reversa do monorepo `exeq-nfse-core` (admin + e2e Playwright existente).*
