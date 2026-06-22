# Merge DAS + Unificação Frontend EXEQ — Análise Fase 0 (completa)

| Campo | Valor |
|-------|-------|
| **Repositório destino** | `exeq-nfse-core` |
| **Repositório origem** | `../Projeto_CobrancaBoleto_v2/cobranca-saas-api` |
| **Data** | 2026-06-22 |
| **Versão** | **2.0** |
| **Status Fase 0** | ✅ **Completa** |
| **Decisões TL** | [MERGE_DAS_DECISOES_TL.md](./MERGE_DAS_DECISOES_TL.md) |

---

## Sumário executivo

Fase 0 concluída com inventário real do **`cobranca-saas-api`** e mapeamento do **`exeq-nfse-core`**. Decisões D1–D10 aprovadas pelo Tech Lead. **Fase 1 (backend DAS MVP) implementada e testada** (`test:merge-das-fase1` — 5/5).

Origem localizada em:  
`C:\Users\riica\OneDrive\Empresas Ricardo\Exeq\Projeto_CobrancaBoleto_v2\cobranca-saas-api`

---

## 0.1 — Destino (`exeq-nfse-core`) — resumo

| Área | Estado pré-merge |
|------|------------------|
| API | Fastify, ~70 endpoints, JWT + RLS |
| Admin | React/Vite, topbar claro `#0b5cab`, sem sidebar |
| Billing | `exeq_core.charge` (gateway mock) — **não confundir com DAS** |
| Tenant | `exeq_core.tenants` UUID |

Ver detalhes na v1.0 deste doc (seções preservadas abaixo).

---

## 0.2 — Origem DAS (`cobranca-saas-api`) — inventário real

### Módulo fiscal-guias (58 arquivos TS)

**Rotas HTTP portal** — prefixo `/v1/portal/fiscal/*` (20 endpoints, flag `FISCAL_GUIAS_ENABLED`):

| Método | Path | Função |
|--------|------|--------|
| GET | `/dashboard` | KPIs processamentos |
| GET | `/guias` | Listagem guias |
| GET | `/guias/:guiaId` | Detalhe |
| GET | `/guias/:guiaId/pdf-url` | URL PDF |
| POST | `/guias/:guiaId/pagamentos` | Registrar pagamento |
| GET/POST | `/certificados/*` | Certificado A1 |
| GET/POST | `/procuracoes/*` | Procuração e-CAC |
| GET/PATCH | `/serpro-config` | Config SERPRO |
| POST | `/ingest/csv` | PGDASD CSV |
| GET/POST | `/processamentos/*` | Pipeline SERPRO |
| GET | `/audit` | Auditoria |

**Inbox async** (fora escopo Fase 1):  
`POST /v1/inbox/webhooks` — eventos `fiscal.capture.requested`, `fiscal.guia.reconciliation.requested` → BullMQ `fiscal-capture`.

**Mock gateway standalone:**  
`scripts/receita-das-mock-gateway.ts` — `POST /das/capture`, `POST /darf/capture` @ `:19443`

### Migrations origem (028–037)

| Migration | Conteúdo |
|-----------|----------|
| 028 | Schema `fiscal`, `guia_fiscal`, certificado, procuração |
| 029–030 | Templates WhatsApp guia |
| 032 | `portal.organization`, `fiscal.serpro_config` |
| 033–037 | Vault cert, ingest CSV, processamento SERPRO, audit |

**Conflito tenant:** guias fase 0 usam `tenant_id TEXT` (automacao); ingest/SERPRO usam `organization_id UUID`.

### Dependências externas

- HTTP Receita mock/prod (`RECEITA_DAS_CAPTURE_URL`)
- SERPRO Integra Contador (deferido)
- BullMQ + Redis (6 filas — **fora escopo merge**)
- Certificados PEM + `ENCRYPTION_KEY` (deferido)

---

## 0.3 — Frontend origem (`apps/portal-web`)

| Token | Valor real |
|-------|------------|
| Navy | `#0b1528`, `#0f1a2e`, sidebar `#101d3d` |
| Cyan | `#22d3ee` (index.css) / `#00b8a9` (theme-tokens) |
| Fonte | **Inter** (Google Fonts) |
| Ícones | **Nenhuma lib** — texto/Unicode |
| Layout | `AppShell.tsx`, `ExeqShell.tsx` — sidebar em CSS puro |
| Date | `BrDatePicker.tsx` custom |

Arquivos referência: `src/styles/theme-tokens.css`, `src/index.css`

---

## 0.4 — Conflitos e resoluções (TL)

| Conflito | Resolução Fase 1 |
|----------|------------------|
| `portal.cliente` vs providers | `provider_id` → `exeq_core.providers` |
| `tenant_id TEXT` vs UUID | UUID + RLS padrão exeq |
| `/v1/portal/fiscal/*` vs exeq | Novo contrato **`/v1/das/*`** simplificado |
| Schema `fiscal` vs `exeq_das` | **`exeq_das.guia_fiscal`** |
| Express 7 middlewares | Fastify plugin — 3 handlers |
| BullMQ workers | **Deferido** — captura síncrona MVP |
| Certificados/procuração | **Deferido** Fase 2+ |

---

## Fase 1 — Backend DAS (entregue)

### Endpoints implementados

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/v1/das/guias` | JWT | Listagem + filtros |
| GET | `/v1/das/guias/:id` | JWT | Detalhe |
| POST | `/v1/das/emitir` | JWT + WRITE | Emite DAS/DARF (mock/HTTP) |

### Arquivos criados

```
packages/shared/src/das.ts
apps/api/src/modules/das/das.routes.ts
apps/api/src/modules/das/das.service.ts
apps/api/src/modules/das/receita-gateway.service.ts
apps/api/src/db/migrations/0026_exeq_das_guia_fiscal.sql
apps/api/src/db/migrations/0027_exeq_das_schema_grants.sql
scripts/receita-das-mock-gateway.mjs
apps/api/tests/merge-das-fase1.test.ts
apps/api/tests/das-receita-gateway.unit.test.ts
```

### Env vars

```
FISCAL_DAS_ENABLED=true
RECEITA_DAS_MOCK=true
RECEITA_GATEWAY_PROVIDER=mock|http
RECEITA_DAS_CAPTURE_URL=http://127.0.0.1:19443
```

### Gate

```powershell
npm run test:merge-das-fase1   # 5/5
npm run db:setup
npm run receita:mock:gateway   # homolog HTTP
```

---

## Status das fases

| Fase | Descrição | Status |
|------|-----------|--------|
| **0** | Análise | ✅ Completa |
| **1** | Backend DAS MVP | ✅ **Entregue** (5/5 testes) |
| **2** | Design system ui-tokens | ⬜ Pendente |
| **3** | Sidebar accordion | ⬜ Pendente |
| **4** | Páginas DAS admin | ⬜ Pendente |
| **5** | Refator visual NFS-e | ⬜ Pendente |
| **6** | Responsividade + a11y | ⬜ Pendente |
| **7** | E2E + PRs finais | ⬜ Pendente |

---

## Próximo passo recomendado

**Fase 2** — `packages/ui-tokens` com paleta EXEQ do `portal-web` (Inter, navy `#0D1B2A`, cyan `#00C4E8` unificado).

---

## Anexo — Mapa API destino (pré-merge, referência)

*(Seções 0.1 detalhadas da v1.0 — rotas NFS-e, auth JWT, admin pages, env vars — permanecem válidas; ver git history ou backup v1.0.)*

Principais rotas existentes **inalteradas** pelo merge DAS:

- `/v1/nf/issues/*` — emissão NFS-e
- `/v1/charges/*` — cobrança gateway
- `/v1/fiscal/*` — domínio RFC-0020
- `/v1/channel/*` — WhatsApp

---

*Atualizado 2026-06-22 — Fase 0 completa + Fase 1 backend entregue.*
