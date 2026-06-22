# Decisões Tech Lead — Merge DAS EXEQ

| Campo | Valor |
|-------|-------|
| **Data** | 2026-06-22 |
| **Autor** | Tech Lead Sênior |
| **Referência** | [MERGE_DAS_ANALISE.md](./MERGE_DAS_ANALISE.md) |
| **Status** | **Aprovado — Fase 1 iniciada** |

---

## Repositório origem localizado

```
../Projeto_CobrancaBoleto_v2/cobranca-saas-api
```

Caminho absoluto:  
`C:\Users\riica\OneDrive\Empresas Ricardo\Exeq\Projeto_CobrancaBoleto_v2\cobranca-saas-api`

---

## Decisões D1–D10

| # | Decisão | Resolução TL |
|---|---------|--------------|
| D1 | Acesso origem | ✅ Localizado em `Projeto_CobrancaBoleto_v2` |
| D2 | Prefixo API | **`/v1/das/*`** — contrato simplificado para exeq (origem usa `/v1/portal/fiscal/*`) |
| D3 | Schema DB | **`exeq_das.guia_fiscal`** + RLS `tenant_id UUID` |
| D4 | DARF escopo | **Sim** — `tipo_guia: DAS \| DARF` no MVP Fase 1 |
| D5 | RBAC | **`WRITE_ROLES`** (`tenant_admin`, `operator`) — emitir; leitura autenticada |
| D6 | URLs admin | **Redirects** — manter `/issues`, `/charges` na Fase 5 |
| D7 | Backend port | **Fastify plugin** `modules/das/` — sem `apps/das-api` separado no MVP |
| D8 | PRs | **1 PR por fase** — Fase 1 isolada |
| D9 | Sprint 21 paralelo | **Trilhas independentes** — backfill ≠ merge DAS |
| D10 | Design login | **Referência real:** `portal-web/src/index.css` + `theme-tokens.css` (não admin atual) |

---

## Escopo Fase 1 entregue (MVP)

| Item | Implementação |
|------|---------------|
| Migration | `0026_exeq_das_guia_fiscal.sql` |
| Shared | `packages/shared/src/das.ts` |
| API | `GET /v1/das/guias`, `GET /v1/das/guias/:id`, `POST /v1/das/emitir` |
| Gateway | `receita-gateway.service.ts` (mock + HTTP) |
| Mock homolog | `scripts/receita-das-mock-gateway.mjs` |
| Flag | `FISCAL_DAS_ENABLED` |
| Testes | `test:merge-das-fase1` |

---

## Deferido (Fases 2–7)

- Certificados A1, procuração, SERPRO PGDASD, BullMQ workers
- Inbox webhooks `fiscal.capture.requested`
- Portal fiscal completo (20 endpoints origem)
- UI tokens, sidebar accordion, páginas DAS admin
- Storage PDF persistente (hoje só `pdf_storage_key` metadata)

---

## Mapeamento entidade origem → destino

| Origem (`cobranca-saas-api`) | Destino (`exeq-nfse-core`) |
|------------------------------|----------------------------|
| `portal.cliente` | `exeq_core.providers` (CNPJ prestador) |
| `tenant_id TEXT` (automacao) | `tenant_id UUID` (exeq_core.tenants) |
| `fiscal.guia_fiscal` | `exeq_das.guia_fiscal` |
| `portal_cliente_id` | `provider_id` |

---

## Gate Fase 1

```powershell
npm run build -w @exeq/shared
npm run db:setup
npm run test:merge-das-fase1
```
