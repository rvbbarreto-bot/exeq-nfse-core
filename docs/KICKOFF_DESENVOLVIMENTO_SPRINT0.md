# Kickoff — Sprint 0 (pós-autorização PO)

| Campo | Valor |
|-------|-------|
| **Base** | `exeq-nfse-core` (único repositório de produto) |
| **Autorização** | `Projeto_Emissao_NFSe/AUTORIZACAO_PO_DESENVOLVIMENTO_CORE_2026-05-30.md` |
| **ADR** | ADR-008 |
| **Duração alvo** | 2 semanas |
| **Início** | 2026-05-30 — **GO PO** ([GO_INICIO_IMEDIATO](../Projeto_Emissao_NFSe/GO_INICIO_IMEDIATO_DESENVOLVIMENTO_2026-05-30.md)) |
| **Status** | **CONCLUÍDO** (2026-05-30) |

---

## Objetivo do sprint

Colocar o Core em condição de **homologação contínua** pelo PO: emissão NF (Focus + Betha mock), canal WhatsApp V13, admin operável para master data, segurança RBAC mínima.

---

## Backlog priorizado

### P0 — Bloqueadores PO

| ID | Story | Critério de aceite |
|----|-------|-------------------|
| S0-01 | RBAC nas rotas de escrita | `readonly` recebe 403 em POST cancel/publish catalog; testes API |
| S0-02 | Admin: CRUD prestador/tomador/serviço | Telas list/create/edit; consome `/v1/providers`, `/customers`, `/services` |
| S0-03 | Vault Betha para PO | `rotate-tenant-secret` aceita `betha_certificate*`; script `save-betha-certificate-po.mjs` |
| S0-04 | Homolog Betha Atibaia | `npm run homolog:emission:atibaia:betha` com `BETHA_MOCK=true` → authorized |

### P1 — Canal

| ID | Story | Critério de aceite |
|----|-------|-------------------|
| S0-05 | Cutover n8n V13 | ✅ Runbook + `homolog:channel:cutover` OK; FW-01..08 verdes |
| S0-06 | Admin: visão channel | ✅ `/channel` — sessões + notificações |

### P2 — Débito técnico

| ID | Story | Critério de aceite |
|----|-------|-------------------|
| S0-07 | Rate limit API auth | ✅ `POST /v1/auth/login` — 10 req/min/IP (legado) |
| S0-08 | CI inclui admin unit tests | ✅ `.github/workflows/ci.yml` |

---

## Ambiente local padrão

```env
# .env.local (exemplo homolog)
BETHA_ATIBAIA_ENABLED=true
BETHA_MOCK=true
NF_SYNC_PROCESSING=false
FOCUS_MOCK=false
```

```powershell
npm run db:migrate
npm run homolog:focus:ensure-data
npm run dev
npm run worker -w @exeq/api
npm run dev:admin
```

---

## Definition of Done (Sprint 0)

1. PR mergeado na branch de desenvolvimento com CI verde
2. Testes novos cobrindo RBAC e script Betha
3. PO executou homolog emissão Atibaia (Focus ou Betha mock) com evidência
4. Documentação atualizada (este arquivo + ADR-008)
5. Nenhum commit de feature nova em `Projeto_EmissaoNF`

---

## Fora de escopo Sprint 0

- Portal cliente final (spec legado `portal-read`)
- Betha SOAP produção (WSDL + certificado PO)
- Motor RTC 2026 completo
- Deploy produção

---

## Rituais

| Ritual | Frequência |
|--------|------------|
| Daily 15min | Diário |
| Demo PO (homolog ao vivo) | Fim sprint |
| Regressão `npm test` + phase8 | Antes de demo |
