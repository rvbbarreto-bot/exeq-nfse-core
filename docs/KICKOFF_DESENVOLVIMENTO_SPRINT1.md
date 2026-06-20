# Kickoff — Sprint 1 (pós Sprint 0)

| Campo | Valor |
|-------|-------|
| **Base** | `exeq-nfse-core` |
| **Início** | 2026-05-30 |
| **Sprint 0** | ✅ Concluído (S0-01..S0-08) |
| **Infra paralela** | Opção B canal — DevOps (`AUTORIZACAO_PO_INFRA_OPCAO_B`) |
| **Autorização paralela** | [AUTORIZACAO_PO_PARALELA_S1_FILA](../../Projeto_Emissao_NFSe/AUTORIZACAO_PO_PARALELA_S1_FILA_2026-06-19.md) — trilhas A/B/C |
| **Status** | **EM EXECUÇÃO** |

---

## Objetivo

Estabilizar regressão CI, expandir cobertura operacional (ops canal) e preparar homolog PO pós-stack n8n/Evolution.

---

## Backlog Sprint 1

### P0 — Estabilidade

| ID | Story | Critério de aceite |
|----|-------|-------------------|
| S1-01 | Testes ops canal API | ✅ `ops-channel.functional.test.ts` |
| S1-02 | Regressão cobrança em CI | ✅ `GATEWAY_SYNC_PROCESSING=false` em vitest — **211/211** |
| S1-03 | Docs path testes | ✅ `resolveDocsRoot` → `EmissaoNFSe/docs` |

### P1 — Homolog PO

| ID | Story | Critério de aceite |
|----|-------|-------------------|
| S1-04 | Handoff pós-canal DevOps | ✅ Gates A — PO manual P1/P3 ([evidências](../../EmissaoNFSe/docs/evidencias/EVIDENCIAS_PARALELA_S1_FILA_2026-06-19.md)) |
| S1-05 | `homolog:doctor` mapa portas | ✅ alerta Redis 6380 vs 6382 |

### P2 — Próximo incremento

| ID | Story | Notas |
|----|-------|-------|
| S1-06 | Betha SOAP submit (skeleton) | ✅ mock + runbook ([evidências](../../EmissaoNFSe/docs/evidencias/EVIDENCIAS_PARALELA_S1_FILA_2026-06-19.md)) |
| S1-07 | E2E Playwright `/channel` + `/master-data` | ✅ 5/5 Playwright |

---

## Comandos

```powershell
cd exeq-nfse-core
npm run test -w @exeq/api
npm run test -w @exeq/admin
npm run homolog:ready-for-qa
npm run homolog:channel:cutover
npm run channel:status    # após DevOps
```

---

## Definition of Done Sprint 1

1. CI verde (API + admin)
2. Ops canal testado
3. PO validou WhatsApp homolog (se DevOps entregou B1–B7)
4. Kickoff e inventário portas atualizados
