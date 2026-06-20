# Runbook — Cutover WhatsApp n8n V9–V12 → V13

| Campo | Valor |
|-------|-------|
| **Versão** | 1.0 |
| **Data** | 2026-05-30 |
| **ADR** | ADR-007 (n8n apenas canal) |
| **Workflow** | `workflows/exeq-nfse-canal-whatsapp-v13.workflow.json` |

---

## 1. Objetivo

Desligar workflows n8n **V9–V12** (fiscal embutido em Code nodes) e operar **V13** (HTTP only → Channel API do Core).

---

## 2. Pré-requisitos

| Item | Comando / verificação |
|------|------------------------|
| Core homolog no ar | `npm run homolog:ready-for-qa` |
| Worker rodando | `.homolog/worker.log` ou `npm run worker -w @exeq/api` |
| `FOCUS_MOCK=true` ou token Focus homolog | vault `focus_token` |
| Channel token no vault | seed: `sandbox-channel-token-piloto` |
| Master data | `npm run homolog:focus:ensure-data` |

---

## 3. Variáveis n8n (homolog)

```env
EXEQ_API_BASE_URL=http://localhost:3002
EXEQ_TENANT_SLUG=piloto-sp
EXEQ_CHANNEL_TOKEN=sandbox-channel-token-piloto
EVOLUTION_API_URL=http://localhost:8082
EVOLUTION_INSTANCE=nfse-piloto
EVOLUTION_API_KEY=...
```

> **Opção B (PO):** n8n em http://localhost:5680 · Evolution em http://localhost:8082  
> Subir stack: `npm run channel:up` — runbook `docs/runbooks/RUNBOOK_CHANNEL_STACK_OPCAO_B.md`

> Ajuste `EXEQ_API_BASE_URL` para a porta do `.env` (`PORT=3002`).

---

## 4. Importar workflow V13

1. Abra n8n homolog
2. **Workflows → Import from file**
3. Selecione: `exeq-nfse-core/workflows/exeq-nfse-canal-whatsapp-v13.workflow.json`
4. Configure credenciais/env acima
5. **Ative** o workflow V13
6. **Desative** workflows V9, V10, V11, V12

---

## 5. Gate automatizado (sem Evolution)

Simula o que o n8n faz (sessão → draft → confirm → notificação).

**Preflight emissão homolog** (um dos modos):

| Modo | Variáveis `.env.local` |
|------|------------------------|
| Focus mock | `FOCUS_MOCK=true` |
| **Atibaia/Betha mock** (PO) | `BETHA_ATIBAIA_ENABLED=true` + `BETHA_MOCK=true` (`FOCUS_MOCK=false`) |

```powershell
cd exeq-nfse-core
npm run homolog:channel:cutover
```

**Saída esperada:** `OK — Cutover canal V13 (Core API) validado`

---

## 6. Gate com Evolution (PO)

1. Envie mensagem teste no WhatsApp homolog
2. n8n cria sessão + coleta draft (conforme seu fluxo conversacional)
3. Confirme emissão
4. Verifique NFS-e **authorized** no admin → Emissões
5. Verifique mensagem de retorno no WhatsApp (poll notifications → sendText → ack)

---

## 7. Checklist cutover produção

| # | Ação | OK |
|---|------|-----|
| 1 | V13 importado e ativo em homolog | ☐ |
| 2 | `homolog:channel:cutover` verde | ☐ |
| 3 | V9–V12 desativados em homolog | ☐ |
| 4 | PO validou emissão via canal | ☐ |
| 5 | Evidência anexada na sprint | ☐ |
| 6 | Repetir em produção (janela acordada) | ☐ |

---

## 8. Rollback

1. Reativar workflow V12 (último estável legado) **somente se emergência**
2. Desativar V13
3. Registrar incidente — fiscal no n8n viola ADR-007; rollback é temporário

---

## 9. Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| 401 channel | Token errado | Conferir vault `channel_token` |
| 422 FOCUS_TOKEN | Sem token Focus | `npm run homolog:focus:save-token` |
| Confirm 422 draft | Campos faltando | PATCH com `provider_id`, `customer_id`, etc. |
| Sem notification | Issue não terminal | Aguardar worker; conferir worker.log |
| Timeout poll | Worker off ou emissão ainda `queued` | `NF_SYNC_PROCESSING=true` na API **ou** worker ativo; poll só enxerga notificação após status terminal (`authorized`/`rejected`) |
| Pending API vazio | Normal durante coleta de dados ou antes de `confirmar` | Notificação `nf.authorized` só nasce **depois** da emissão terminar |
| n8n 500 no webhook | `Respond to Webhook` referenciou nó não executado | Reimportar V15: `npm run channel:import-workflow` |
| API ECONNREFUSED no n8n | `EXEQ_API_BASE_URL` errado dentro do container | Usar `http://host.docker.internal:3002` no `.env.channel` |

---

## 10. Referências

- API canal: `FASE8_CANAL_WHATSAPP.md` (docs oficial)
- Testes: `npm run test -w @exeq/api -- phase8.functional`
- Admin canal (S0-06): `/channel` no portal
