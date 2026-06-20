# Runbook — Stack canal Opção B (n8n + Evolution dedicados NFSe)

| Campo | Valor |
|-------|-------|
| **PO** | [AUTORIZACAO_PO_INFRA_OPCAO_B_2026-05-30.md](../../../Projeto_Emissao_NFSe/AUTORIZACAO_PO_INFRA_OPCAO_B_2026-05-30.md) |
| **Portas** | n8n **5680**, Evolution **8082** |

---

## 1. Pré-requisitos

| Item | Comando |
|------|---------|
| Infra base | `docker compose up -d` (Postgres 55432, Redis 6382) |
| API + worker + admin | `npm run homolog:ready-for-qa` |
| Arquivo secrets | `copy .env.channel.example .env.channel` e preencher |

---

## 2. Subir stack canal

```powershell
cd exeq-nfse-core
docker compose -f docker-compose.yml -f docker-compose.channel.yml --profile channel up -d
npm run channel:status
```

**URLs:**

| Serviço | URL |
|---------|-----|
| n8n | http://localhost:5680 |
| Evolution | http://localhost:8082 |
| API Core | http://localhost:3002 |

---

## 3. Evolution — parear WhatsApp

1. Acesse http://localhost:8082/manager (ou UI da imagem evoapicloud)
2. Crie instância `nfse-piloto` (ou valor de `EVOLUTION_INSTANCE`)
3. Escaneie QR Code com número de homolog
4. Confirme `EVOLUTION_API_KEY` igual no `.env.channel` e nas variáveis do n8n

---

## 4. n8n — importar workflow V13

1. Acesse http://localhost:5680 (basic auth do `.env.channel`)
2. **Workflows → Import** → `workflows/exeq-nfse-canal-whatsapp-v13.workflow.json`
3. Confirme variáveis de ambiente (Settings → Variables ou env do container)
4. Ative o workflow
5. **Não** usar workflows V9–V12 do legado

---

## 5. Validar

```powershell
# Gate Core (sem WhatsApp)
npm run homolog:channel:cutover

# PO: mensagem teste no WhatsApp homolog + verificar /channel no admin
```

---

## 6. Parar stack canal

```powershell
docker compose -f docker-compose.yml -f docker-compose.channel.yml --profile channel down
```

Infra base (Postgres/Redis) permanece com `docker compose up -d`.

---

## 7. Troubleshooting

| Sintoma | Verificação |
|---------|-------------|
| n8n não alcança API | `EXEQ_API_BASE_URL=http://host.docker.internal:3002`; API rodando no host |
| Evolution 401 | `EVOLUTION_API_KEY` igual em Evolution e n8n |
| Porta em uso | `INVENTARIO_PORTAS_DOCKER_PO_2026-05-30.md` — 5680/8082 reservadas NFSe |
| Worker não emite | Redis **6382**; `npm run homolog:ready-for-qa` após mudar `.env` |
