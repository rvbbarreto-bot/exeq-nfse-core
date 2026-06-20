# Homologação Focus — guia PO

## O que a fábrica já configurou

- Ambiente apontando para `https://homologacao.focusnfe.com.br`
- Mock Focus **desligado** (`FOCUS_MOCK=false`)
- Emissão **assíncrona** (API + worker)
- Scripts de cadastro de token e master data

## O que o PO precisa fazer (2 passos)

### 1. Cadastrar token Focus

No painel Focus (homologação), copie o token do emitente.

```powershell
cd exeq-nfse-core
$env:FOCUS_TOKEN = "SEU_TOKEN_AQUI"
npm run homolog:focus:save-token
```

Confirmação esperada: `Token focus_token gravado para tenant piloto-sp`.

### 2. Cadastrar prestador real

Copie o exemplo e preencha com dados **iguais à Focus**:

```powershell
copy .env.homolog.focus.example .env.local
# Edite .env.local com CNPJ, razão social e inscrição municipal reais
npm run homolog:focus:ensure-data
```

## Emitir nota de teste (Atibaia — IBGE 3504107)

```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run worker -w @exeq/api

# Terminal 3
npm run homolog:emission:atibaia
```

Alternativa legada: `npm run homolog:emission:santo-andre`

Login admin: `admin@piloto.local` / `changeme` (dev).

## Se falhar

| Erro | Ação |
|------|------|
| `FOCUS_TOKEN_MISSING` | Rodar `homolog:focus:save-token` |
| `422` / token inválido | Token de homologação + CNPJ igual Focus |
| `queued` / `polling` parado | Worker não está rodando |
| `rejected` / TAX_RULE | Catálogo sem regra para IBGE/serviço/regime |
| `rejected` / Focus | Ver detalhe em `GET /v1/nf/issues/:id` → `focus_erros` |
| `E0207` CPF tomador | Tomador CPF não existe na RF — use **CNPJ** em `.env.local` ou rode `homolog:focus:ensure-data` (usa CNPJ prestador por padrão) |
| `E0037` município emissor | Atibaia pode não estar no **convênio nacional** em homolog — validar com contador/prefeitura no portal NFS-e nacional |

## Segurança

- **Nunca** commitar token, `.env.local` ou print com token
- Rotacionar token: `node scripts/rotate-tenant-secret.mjs --tenant-slug piloto-sp --kind focus_token --value "..."`
