# Checklist PO/QA — Workflow n8n V15 (WhatsApp → Core → Focus)

**Workflow:** `exeq-nfse-canal-whatsapp-v15`  
**Data validação fábrica:** 2026-06-19  
**Ambiente:** Focus **PRODUÇÃO** (`https://api.focusnfe.com.br`, mock off) — PO 2026-06-19

---

## 0. Pré-requisitos (antes de abrir o n8n)

| # | Verificação | Comando / URL | Esperado |
|---|-------------|---------------|----------|
| 0.1 | Ambiente QA | `npm run homolog:ready-for-qa` | Banner `AMBIENTE PRONTO PARA VALIDAÇÃO PO/QA` |
| 0.2 | Stack canal | `npm run channel:up` | Containers `nfse-n8n`, `nfse-evolution` running |
| 0.3 | Workflow importado | `npm run channel:import-workflow` | `OK — aguarde ~25s` |
| 0.4 | Health API | http://localhost:3002/health | `focus.mock: false`, `base_url: https://api.focusnfe.com.br` |
| 0.5 | n8n UI | http://localhost:5680 | Workflow V15 **ativo** (1 cópia apenas) |
| 0.6 | Linha Evolution | `.env.channel` | `CHANNEL_PAIRED_PHONE=+5511973305448` (linha que **recebe** — pareamento no Evolution Manager) |
| 0.7 | Evolution instance | `.env.channel` | `EVOLUTION_INSTANCE=exeq-nfse-core` |

**Mensagem de teste (copiar no WhatsApp):**

```
Tomador: Empresa Exemplo Ltda
Documento: 11444777000161
Valor: R$ 150,00
Descricao: Consultoria em tecnologia da informacao
Data: 19/06/2026
Codigo do servico: 1.01
Codigo do municipio da prestacao: 3504107
Logradouro do tomador: Rua Plinio da Silva Reis
Numero do tomador: 377
Bairro do tomador: Centro
Cep do tomador: 14680000
Codigo do municipio do tomador: 3524303
```

Confirmação: `CONFIRMAR`

---

## 1. Evidência — testes automatizados (QA Senior)

Executado em **2026-06-19** (perfil **PRODUÇÃO** — PO):

| Teste | Comando | Resultado |
|-------|---------|-----------|
| Config produção | `npm run prod:focus:configure` | OK — `.env` + `.env.local` → `api.focusnfe.com.br` |
| Ambiente | `npm run homolog:ready-for-prod` | OK — health `mock=false`, base produção |
| Poll branch | `npm run homolog:n8n:poll` | OK (pending=0 normal sem emissão) |
| E2E canal n8n | `npm run homolog:n8n:e2e` | **PARCIAL** — pipeline OK; emissão `failed` (FOCUS_HTTP_401) |
| Cutover API | `npm run homolog:channel:cutover` | FALHA — FOCUS_HTTP_401 (token vault placeholder) |
| Gate Trilha A | `npm run homolog:channel:gate` | FALHA — emissão não autorizada (401) |

**Último E2E (referência produção):**

- `session_id`: `6d564b63-0595-44d0-9326-01025db16b8a`
- `issue_id`: `04dd6e87-3066-425f-a82d-f509bf175ab1`
- `status`: `failed` — `FOCUS_HTTP_401` (token vault = placeholder seed; **não** token produção)
- Pipeline n8n: draft → `ready_to_confirm` → confirm → outbound `nf.failed` → Evolution HTTP 201

**Bloqueio PO:** gravar token **produção** (diferente do homolog):

```powershell
$env:FOCUS_TOKEN = "token-do-painel-focus-producao"
npm run prod:focus:save-token
npm run homolog:ready-for-prod
npm run channel:import-workflow
npm run homolog:n8n:e2e
```

Após token válido, emissão deve chegar à SEFIN. Tomador padrão usa endereço **RF** (Jardinópolis CEP `14680000` / IBGE `3524303`) — CEP Atibaia com CNPJ tomador gera **E0240**.

---

## 2. Branch INBOUND — validação nó a nó (webhook Evolution)

> **Como validar no n8n:** Executions → última execução do webhook → abrir cada nó → aba **Output** → comparar campos abaixo.  
> **Print esperado:** JSON legível com os campos indicados (não vazio). Qualquer cliente que envia **para** a linha Exeq deve passar — **não** exige remetente = linha Evolution.

### 2.1 Webhook Evolution

| Campo / aspecto | Esperado (fluxo feliz) | Falha se |
|-----------------|------------------------|----------|
| Entrada | Payload Evolution `messages.upsert` com `data.message.conversation` | Body vazio |
| HTTP response final | JSON com `ok: true` (via Respond to Webhook) | Timeout ou `{}` |

**Print:** painel de execução iniciado; entrada mostra `event`, `data.key`, `data.message`.

---

### 2.2 Filtrar Evento Webhook

| Campo | Esperado | Falha se |
|-------|----------|----------|
| `evento_valido` | `true` | `false` (mensagem ignorada) |
| `phone_e164` | `+5511973857162` (remetente no webhook) | `""` |
| `text` | Texto completo da NFS-e | `""` |
| `webhook_meta.fromMe` | `false` | `true` (eco do bot) |
| `webhook_meta.isGroup` | `false` | `true` |
| `webhook_meta.hasText` | `true` | `false` |

**Print:** `evento_valido: true`, `phone_e164: "+5511973305448"`, bloco `text` preenchido.

**Nota:** Evolution pode enviar JID `11973305448@...` — workflow normaliza para `+5511973305448`.

---

### 2.3 Evento Valido?

| Ramo | Esperado |
|------|----------|
| **TRUE** → Preparar Texto Audio | Mensagem real do cliente |
| **FALSE** → Preparar Resposta Ignorada | ACK, grupo, fromMe, evento inválido |

**Print:** seta verde para cima (TRUE) no fluxo feliz.

---

### 2.4 Preparar Texto Audio

| Campo | Esperado | Falha se |
|-------|----------|----------|
| `text` | Igual ao Filtrar | Perdido |
| `transcribed_text` | `""` (texto) ou texto transcrito (áudio) | — |
| `has_audio` | `false` (texto) | — |

**Print:** `text` preservado; sem erro de execução.

---

### 2.5 Normalizar Telefone Cliente

| Campo | Esperado | Falha se |
|-------|----------|----------|
| `phone_identified` | `true` | `false` → telefone inválido |
| `phone_e164` | `+5511973857162` (remetente/cliente) | vazio |
| `evolution_number` | `5511973857162` (só dígitos) | < 10 dígitos |

**Print:** `phone_identified: true` — qualquer cliente que envia **para** a linha Exeq.

---

### 2.6 Telefone Identificado?

| Ramo | Esperado |
|------|----------|
| **TRUE** → Montar Body Inbound | Fluxo feliz (cliente identificado) |
| **FALSE** → Preparar Resposta Ignorada | JID inválido / sem telefone |

**Print:** ramo TRUE no fluxo feliz (ex.: cliente `11973857162`).

---

### 2.7 Montar Body Inbound

| Campo | Esperado | Falha se |
|-------|----------|----------|
| `phone_e164` | `+5511973857162` (remetente) | vazio |
| `message_id` | ID Evolution ou `wa-*` | — |
| `text` | Mensagem do usuário | vazio |
| `transcribed_text` | **ausente** ou preenchido (nunca `""` explícito) | — |

**Print:** objeto inbound com `text` preenchido.

---

### 2.8 API Channel Inbound

| Campo | Esperado (mensagem completa) | Esperado (parcial) | Falha se |
|-------|------------------------------|--------------------|----------|
| `session_id` | UUID | UUID | null |
| `status` | `ready_to_confirm` | `collecting` | — |
| `reply_text` | Resumo + *"responda CONFIRMAR"* | Lista campos faltantes | *"Não recebi texto"* |
| `emitted` | `false` | `false` | — |
| `send_reply` | `true` | `true` | `false` |

**Print:** `status: "ready_to_confirm"`, `reply_text` com bullet points dos dados.

---

### 2.9 Montar Resposta WhatsApp

| Campo | Esperado | Falha se |
|-------|----------|----------|
| `reply_text` | Igual ou enriquecido vs API | vazio |
| `send_reply` | `true` | `false` |
| `evolution_number` | `5511973857162` | vazio |

**Print:** `send_reply: true`, `reply_text` multilinha.

---

### 2.10 Enviar Resposta?

| Ramo | Esperado |
|------|----------|
| **TRUE** → Evolution Send Reply | `send_reply true` + número ≥ 10 dígitos |
| **FALSE** → Montar Resposta Webhook | Sem texto para enviar |

**Print:** ramo TRUE.

---

### 2.11 Evolution Send Reply

| Campo | Esperado | Falha se |
|-------|----------|----------|
| `evolution_sent` | `true` | `false` |
| `evolution_error` | ausente | mensagem de erro |

**Print WhatsApp (cliente):** mensagem com resumo da NFS-e ou pedido de campos.

**Print n8n:** `evolution_sent: true`.

---

### 2.12 Montar Resposta Webhook → Respond to Webhook

| Campo | Esperado |
|-------|----------|
| `ok` | `true` |
| `ignored` | `false` |
| `session_id` | UUID |
| `status` | `collecting` ou `ready_to_confirm` |
| `reply_text` | Texto enviado ao cliente |
| `send_reply` | `true` |

**Print:** JSON final do webhook HTTP 200.

---

### 2.13 Preparar Resposta Ignorada (caminho alternativo)

Usar apenas se evento inválido ou telefone não identificado.

| `skip_reason` | Esperado no WhatsApp |
|---------------|----------------------|
| `missing_phone` | *"Não consebi identificar seu número..."* |
| `invalid_event` | Sem resposta (normal) |

**Print:** `send_reply: true` quando `missing_phone`.

---

## 3. Branch CONFIRMAR — segunda mensagem (webhook)

Repetir checklist **2.8–2.12** com texto `CONFIRMAR`:

| Campo (API Channel Inbound) | Esperado |
|------------------------------|----------|
| `status` | `processing` ou pós-confirm |
| `emitted` | `true` |
| `issue_id` | UUID |
| `reply_text` | *"Sua NFS-e foi enviada para processamento..."* |

**Print WhatsApp:** confirmação de envio para processamento.

---

## 4. Branch POLL — validação nó a nó (schedule 1 min)

> **Como validar:** Executions → filtrar por trigger **Poll Notifications** (ou aguardar 1 min após emissão).

### 4.1 Poll Notifications

| Aspecto | Esperado |
|---------|----------|
| Trigger | A cada 1 minuto |
| Saída | 1 item vazio (trigger) |

---

### 4.2 API Pending Notifications

| Campo | Esperado (sem emissão) | Esperado (pós-authorized) | Falha se |
|-------|------------------------|----------------------------|----------|
| `statusCode` | `200` | `200` | `0` ou ≥ 400 |
| `api_url` | `http://host.docker.internal:3002/.../pending?limit=20` | idem | URL quebrada / `[not accessible]` |
| `body.items` | `[]` | array com ≥ 1 item | — |
| `error` | ausente | ausente | string de erro |

**Print:** `statusCode: 200`, `api_url` completa (não preview quebrado do editor).

---

### 4.3 Normalizar Pending API

| Campo | Esperado (coleta/emissão) | Esperado (NF autorizada) |
|-------|---------------------------|--------------------------|
| `api_ok` | `true` | `true` |
| `pending_total` | `0` | `≥ 1` |
| `pending_filtered` | `0` | `≥ 1` |
| `has_pending` | `false` | `true` |
| `hint` | *"Sem notificacoes pendentes — normal..."* | `null` |
| `api_error` | `null` | `null` |

**Print:** `pending_total: 0` **não é erro** durante coleta; após emissão deve subir.

---

### 4.4 Tem Pending?

| Ramo | Quando | Próximo nó |
|------|--------|------------|
| **FALSE** | Sem NF terminal ainda | Sem Pending (Normal) |
| **TRUE** | NF `authorized`/`rejected` na fila | Expand Pending Items |

**Print FALSE:** `action: "skip_poll"`, `hint` explicativo — **fluxo encerra normalmente**.

---

### 4.5 Sem Pending (Normal)

| Campo | Esperado |
|-------|----------|
| `ok` | `true` |
| `action` | `skip_poll` |
| `pending_total` | `0` |
| `hint` | Texto explicando espera |

**Print:** saída explícita (não execução “morta” sem nós).

---

### 4.6 Expand Pending Items → Evolution Send Status

| Campo | Esperado |
|-------|----------|
| `id` | UUID notificação |
| `phone_e164` | `+5511973305448` |
| `message_body` | Texto status NF (autorizada/rejeitada) |
| `evolution_sent` | `true` |

**Print WhatsApp:** mensagem de status da NFS-e (número, link, etc.).

---

### 4.7 Preservar ID Notificacao → API Ack Notification

| Campo | Esperado |
|-------|----------|
| `acked` | `true` |
| `id` | UUID da notificação |

**Print:** segunda execução poll com `pending_total: 0` (fila esvaziada).

---

## 5. Roteiro manual PO (WhatsApp real)

| Passo | Ação | Evidência PO |
|-------|------|--------------|
| 5.1 | Enviar mensagem rotulada completa | Print WhatsApp: resumo + CONFIRMAR |
| 5.2 | Responder `CONFIRMAR` | Print: *"enviada para processamento"* |
| 5.3 | Aguardar até 2 min | Print: status autorizado/rejeitado |
| 5.4 | Abrir n8n Executions (webhook) | Prints nós 2.2–2.12 conforme acima |
| 5.5 | Abrir n8n Executions (poll) | Prints nós 4.2–4.7 |
| 5.6 | Portal admin | http://localhost:5173 — NFS-e listada |
| 5.7 | Health | `/health` — `focus.mock: false`, `base_url: api.focusnfe.com.br` |

---

## 6. Critérios de aceite PO

- [ ] Cliente recebe resposta em **≤ 30s** após cada mensagem válida
- [ ] Mensagem completa → `ready_to_confirm` + pedido CONFIRMAR
- [ ] CONFIRMAR → emissão iniciada (`emitted: true`, `issue_id` preenchido)
- [ ] Status final via poll → WhatsApp com resultado (`authorized` ou `rejected` com código Focus legível)
- [ ] Cliente externo (ex. `11973857162`) envia **para** linha Exeq → sessão criada sem bloqueio
- [ ] Nenhum `reply_text` *"Não recebi texto"* com mensagem rotulada completa
- [ ] Poll com `api_ok: true`; `pending_total: 0` aceitável **antes** da emissão terminal
- [ ] Gate automatizado verde: `npm run homolog:channel:gate`

---

## 7. Comandos rápidos QA

```powershell
cd exeq-nfse-core
npm run homolog:ready-for-prod
npm run channel:import-workflow
Start-Sleep 28
npm run homolog:n8n:poll
npm run homolog:n8n:e2e
npm run homolog:channel:gate
```

---

## 8. Assinaturas

| Papel | Nome | Data | OK |
|-------|------|------|-----|
| QA Senior | | | |
| PO | | | |
| Fábrica | | 2026-06-19 | Automatizado OK |
