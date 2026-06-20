# Deploy produção — exeq-nfse-core

## 1. Build

```bash
npm ci
npm run build -w @exeq/shared
npm run build -w @exeq/api
npm run build -w @exeq/admin
```

Artefatos:

- API: `apps/api/dist/`
- Admin: `apps/admin/dist/` (servir via nginx/CDN)

## 2. Migrações

```bash
# Com MIGRATION_DATABASE_URL (role exeq, não exeq_app)
npm run db:migrate -w @exeq/api
```

Após migrate, o log deve indicar migrations aplicadas ou `schema up to date`. A migration `0010_charge_gateway_payment_url.sql` cria a coluna `gateway_payment_url` em `exeq_core.charge` (obrigatória para cobrança/UAT-17).

Em homolog local (opcional):

```bash
npm run schema:gate:charge
```

**Seed:** apenas no primeiro provisionamento do tenant piloto. Em produção contínua, cadastrar tenants via processo controlado.

## 3. Processos

| Serviço | Comando |
|---------|---------|
| API | `node apps/api/dist/server.js` ou `npm run start -w @exeq/api` |
| Worker | `node apps/api/dist/worker.js` ou `npm run worker -w @exeq/api` |

Recomendação: PM2, systemd ou Kubernetes Deployment separados para API e worker.

## 4. Smoke pós-deploy

```bash
API_URL=https://api.seudominio.com \
SMOKE_EMAIL=admin@tenant.com \
SMOKE_PASSWORD='***' \
npm run smoke:prod
```

Ou testes automatizados: `npm run test:phase10 -w @exeq/api`

## 4.1 Gateway HTTP (produção — Sprint 19)

Produção piloto com cobrança real:

```bash
# API/worker com GATEWAY_MOCK=false e gateway_key no vault
GATEWAY_MOCK=false GATEWAY_SYNC_PROCESSING=true \
API_URL=https://api.seudominio.com \
npm run smoke:gateway-prod

# Opcional: webhook paid após pagamento sandbox
CHARGE_ID=<uuid> npm run prod:gateway-postdeploy
```

Runbook rotação de key: [`../../docs/GATEWAY_PROD_ROTACAO.md`](../../docs/GATEWAY_PROD_ROTACAO.md).

Admin: dashboard exibe badge **Gateway: Mock** vs **Gateway: HTTP** (via `GET /health`).

## 5. Admin

Configurar `VITE_API_URL` no build se API em host diferente (variável Vite no build time).

Dev local usa proxy Vite; produção: nginx com `location /v1` → API upstream.

## 6. Checklist completo

Ver `Projeto_Emissao_NFSe/GO_LIVE_PILOTO_CHECKLIST.md`.
