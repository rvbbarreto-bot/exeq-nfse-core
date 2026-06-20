# Runbook — Regras municipais de emissão (Focus Nacional)

| Versão | 2026-06 |
|--------|---------|
| Público | Time sênior (dev + QA + ops) |
| Escopo | Onboarding municípios, correção CNC (ex.: E0120), governança payload |

## Decisão de arquitetura (gestão)

- **Atibaia (3504107)** emite via **Focus Nacional** (`provider_kind: focus_nacional`).
- **Betha direto** não é o caminho principal para Atibaia.
- Regras CNC/payload ficam em **`municipal_emission_rules`** — nunca `if (ibge === "...")` em builders.

## Tabelas

| Tabela | Função |
|--------|--------|
| `exeq_core.municipal_emission_rules` | Regras de payload + provider (fonte primária) |
| `exeq_core.municipal_nfse_routing` | Roteamento legado — **sincronizado no upsert** |

### Colunas principais

- `enviar_inscricao_municipal_prestador` — `false` quando CNC rejeita IM (E0120)
- `provider_kind` — `focus_nacional` \| `betha`
- `payload_flags` (JSONB) — flags extensíveis sem nova migration

Exemplo `payload_flags` Atibaia (migration 0014):

```json
{
  "endereco_tomador_fallback": {
    "street": "Rua Dona Sinha",
    "number": "100",
    "district": "Centro",
    "zip_code": "12940000"
  }
}
```

## Migrations obrigatórias (deploy)

```bash
npm run db:migrate -w @exeq/api
```

- `0013_municipal_emission_rules.sql` — tabela + seed Atibaia (`enviar_im = false`)
- `0014_municipal_emission_payload_flags.sql` — `payload_flags` + endereço homolog Atibaia

## Demanda 1 — Focus Nacional Atibaia

Verificar após deploy:

```bash
curl http://localhost:3000/health
```

Esperado:

```json
"atibaia_routing": {
  "provider": "focus_nacional",
  "ibge": "3504107",
  "enviar_inscricao_municipal_prestador": false
}
```

## Demanda 2 — Onboarding novo município

### Via API (tenant_admin)

```http
PUT /v1/fiscal/municipal-rules/{ibge}
Authorization: Bearer <token>
```

Body:

```json
{
  "municipio_nome": "Novo Município",
  "uf": "SP",
  "enviar_inscricao_municipal_prestador": true,
  "usa_nfse_nacional": true,
  "provider_kind": "focus_nacional",
  "observacao": "Onboarding piloto",
  "payload_flags": {}
}
```

### Via CLI

```bash
node scripts/onboard-municipio.mjs \
  --ibge 3550308 --nome "São Paulo" --uf SP \
  --provider focus_nacional --enviar-im true
```

**Processo quando CNC rejeita emissão:**

1. Identificar código (ex.: E0120) e campo Focus afetado.
2. Adicionar/ajustar flag em `municipal_emission_rules` ou `payload_flags`.
3. Implementar leitura no adapter via `dto.regras_municipais` (se nova flag).
4. Teste unitário + snapshot P0.
5. **Não** hardcodar IBGE no TypeScript.

## Demanda 3 — Proibido hardcode IBGE

Regra no adapter Focus:

```typescript
if (shouldIncludeInscricaoMunicipalPrestador(dto)) {
  payload.inscricao_municipal_prestador = dto.prestador.inscricao_municipal!;
}
```

Fonte: `MunicipalRulesService` → `emit-nf.use-case` → `regras_municipais` no DTO.

## Demanda 4 — Expandir regras

Ordem recomendada para nova exigência CNC:

1. Coluna booleana — se regra binária estável (como `enviar_inscricao_municipal_prestador`).
2. `payload_flags` — se específica ou experimental.
3. Adapter lê `dto.regras_municipais` / `payload_flags`.
4. Seed migration ou `PUT` API para municípios afetados.

## Demanda 5 — Validação produção (CNPJ 37229907000137)

### Checklist pré-emissão

- [ ] Migrations 0013 + 0014 aplicadas
- [ ] `habilita_nfsen_producao` no painel Focus (CNPJ prestador)
- [ ] Token Focus produção no vault (`npm run prod:focus:save-token`)
- [ ] Worker/API com `FOCUS_BASE_URL=https://api.focusnfe.com.br`

### Executar validação

```bash
# Homolog / sandbox (sem nota prod)
npm run validate:e0120:atibaia

# Apenas DB + health (sem POST emissão)
SKIP_EMISSION=true npm run validate:e0120:atibaia

# Produção (nota real — requer confirmação)
$env:PROD_EMISSION_CONFIRM = "yes"
npm run prod:validate:e0120:atibaia
```

**Critério de sucesso:** ausência de `E0120` no metadata Focus; payload sem `inscricao_municipal_prestador`.

## Testes automatizados

```bash
npm run build -w @exeq/shared
npm run test:api
```

Suítes relevantes:

- `focus-nfsen.adapter.unit.test.ts` — Atibaia omite IM; genérico envia IM
- `municipal-rules.service.unit.test.ts` — resolve + upsert
- `adapter-snapshot.test.ts` — golden P0 Atibaia

## Fluxo de dados

```
POST /v1/nf/issues
  → emit-nf.use-case
    → MunicipalRulesService.resolveDtoByIbge(ibge)
    → buildExeqNfseV1({ regras_municipais })
    → FocusNfseProvider
      → mapExeqNfseV1ToFocusNfsen(dto)
        → shouldIncludeInscricaoMunicipalPrestador(dto)
        → JSON.stringify (omite undefined)
```

## Contatos / escalação

| Bloqueio | Ação |
|----------|------|
| E0120 após deploy | Confirmar migration 0013; `GET /v1/fiscal/municipal-rules/3504107` |
| E0037 | Convênio nacional Focus × município — painel Focus |
| 401 Focus prod | Token vault homolog → `prod:focus:save-token` |
| Nova rejeição CNC | Onboarding flag + teste; não hotfix por IBGE |
