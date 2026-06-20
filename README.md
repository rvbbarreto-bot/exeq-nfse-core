# exeq-nfse-core

Core greenfield — Plataforma SaaS Cobrança + Emissão NFS-e (Focus NFe + Betha).

**Autorização PO (2026-05-30):** repositório **único** de desenvolvimento — ver [AUTORIZACAO_PO](../Projeto_Emissao_NFSe/AUTORIZACAO_PO_DESENVOLVIMENTO_CORE_2026-05-30.md).

**Ambiente PO/QA:** fábrica executa `npm run homolog:ready-for-qa` — ver [ACORDO](../Projeto_Emissao_NFSe/ACORDO_PO_FABRICA_AMBIENTE_QA.md).

**Fase 10** — deploy produção, runbooks, treinamento e handover.

Documentação: [`Projeto_Emissao_NFSe/FASE10_DEPLOY_PRODUCAO_HANDOVER.md`](../Projeto_Emissao_NFSe/FASE10_DEPLOY_PRODUCAO_HANDOVER.md)

## Stack

- Node.js 22, TypeScript, Fastify
- PostgreSQL 16 (RLS multi-tenant)
- Redis 7 (reservado Fase 6+)
- Vitest + GitHub Actions

## Estrutura

```
apps/api          API REST (Fase 1)
apps/admin        Admin React (placeholder Fase 7)
packages/shared   Schemas Zod compartilhados
```

## Quick start

```bash
# 1. Infra
docker compose up -d

# 2. Dependências
cp .env.example .env
npm install

# 3. Build shared + DB
npm run build -w @exeq/shared
npm run db:setup

# 4. API
npm run dev
```

API: `http://localhost:3000`

### Login dev (seed)

```bash
curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@piloto.local","password":"changeme"}'
```

### Tax resolve (exemplo Atibaia 1.01 Simples)

```bash
TOKEN="<access_token>"
curl -s -X POST http://localhost:3000/v1/tax/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ibge_code":"3504107",
    "service_code":"1.01",
    "tax_regime":"simples_nacional",
    "competence_date":"2026-06-01"
  }'
```

Resposta esperada: `iss_rate: 0.02`, `simples_codigo_tributacao: 3`.

## Homolog QA (Sprint 7–9)

Com API e admin rodando (`npm run homolog` ou `homolog:apps`):

```bash
npm run homolog:smoke      # gate API
npm run e2e:install        # primeira vez — Chromium
npm run homolog:e2e        # gate portal Playwright (Sprint 9)
npm run uat:charge         # UAT-17
npm run uat:webhook-paid   # UAT-19 API
```

Relatório E2E: `e2e-report/index.html`

## Testes

```bash
npm run db:setup
npm test
npm run test:phase10   # smoke go-live
```

Smoke pós-deploy:

```bash
API_URL=https://api.exemplo.com SMOKE_EMAIL=... SMOKE_PASSWORD=... npm run smoke:prod
```

- **112+ testes API** — fases 1–10
- **18 casos P0** — catálogo H1

## Endpoints

### Fase 1
| Método | Rota | Auth |
|--------|------|------|
| GET | `/health` | Não |
| POST | `/v1/auth/login` | Não |
| POST | `/v1/tax/resolve` | JWT |

### Fase 2 — Master data
| Método | Rota |
|--------|------|
| GET/POST | `/v1/providers` |
| GET/PATCH | `/v1/providers/:id` |
| GET/POST | `/v1/customers` |
| GET/PATCH | `/v1/customers/:id` |
| GET/POST | `/v1/services` |
| GET/PATCH | `/v1/services/:id` |

### Fase 2 — Catálogo fiscal
| Método | Rota |
|--------|------|
| GET/POST | `/v1/fiscal/profiles` |
| GET/PATCH | `/v1/fiscal/profiles/:id` |
| GET/POST | `/v1/fiscal/catalogs` |
| POST | `/v1/fiscal/catalogs/:id/publish` |
| GET/POST | `/v1/fiscal/catalogs/:id/rules` |

## Critérios Fase 2 atendidos

- [x] CRUD prestador, tomador, serviço
- [x] fiscal_profile + municipal_tax_rule versionados
- [x] Publicação draft → published (supersede)
- [x] Tax resolve integrado ao catálogo
- [x] Testes unitários CPF/CNPJ, catalog policy, mapper
- [x] Testes integração Fase 2

## Produção

Ver [`docs/DEPLOY_PRODUCAO.md`](docs/DEPLOY_PRODUCAO.md) e [`.env.production.example`](.env.production.example).

Runbooks: `Projeto_Emissao_NFSe/runbooks/`.
