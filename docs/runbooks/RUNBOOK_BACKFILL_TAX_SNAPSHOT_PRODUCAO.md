# Runbook — Backfill `tax_snapshot` (homolog / produção)

| Campo | Valor |
|-------|-------|
| **Versão** | 1.0 |
| **Data** | 2026-06-22 |
| **RFC** | RFC-0020 pós-Sprint 3 |
| **Autorização PO** | [AUTORIZACAO_PO_OPCAO_A_BACKFILL_PRODUCAO.md](../AUTORIZACAO_PO_OPCAO_A_BACKFILL_PRODUCAO.md) |
| **Referência dev** | [evidência local Sprint 21](../evidencias/SPRINT21_BACKFILL_PILOTO_2026-06-22.md) (15/15 OK) |

---

## 1. Objetivo

Criar retroativamente registros **imutáveis de tributação** (`exeq_fiscal.tax_snapshot`) para emissões NFS-e já **autorizadas** que ainda não possuem snapshot, vinculando `nf_issue.tax_snapshot_id`.

**Por que importa:** auditoria fiscal, conformidade RFC-0020 e consistência do histórico antes de operação contínua em produção.

**O que NÃO faz:**

- Não reemite notas na prefeitura/Focus.
- Não altera status de emissão (`authorized` permanece).
- Não substui catálogo fiscal ou regras municipais.

---

## 2. Público e papéis

| Papel | Responsabilidade |
|-------|------------------|
| **PO** | Autoriza apply após dry-run e aceite contador |
| **Contador** | Valida amostra/contagem quando há candidatos |
| **Ops / Dev** | Executa comandos, coleta evidências, reporta erros |
| **Tech Lead** | Escalation técnica; decide abortar se `errors > 0` no dry-run |

---

## 3. Pré-requisitos

| Item | Verificação |
|------|-------------|
| API no ar | `GET /health` → `status: ok` |
| Migrations aplicadas | Schema inclui `tax_snapshot` e `nf_issue.tax_snapshot_id` |
| Credenciais migration | `MIGRATION_DATABASE_URL` (role `exeq`) disponível no host de execução |
| Tenant piloto | Default: `piloto-sp` (ajustar `--tenant=` se outro) |
| Código deployado | Versão com Sprint 21 (rota admin + scripts) |
| Janela acordada | Preferir **fora do horário de pico** de emissão |

### Backup (produção — obrigatório)

Antes do apply em produção:

1. Snapshot/backup do banco conforme política Exeq (RDS snapshot, `pg_dump`, etc.).
2. Registrar ID/data do backup na evidência.

---

## 4. Parâmetros padrão

| Parâmetro | Default | Notas |
|-----------|---------|-------|
| `days` | 90 | Janela retroativa a partir de `now()` |
| `limit` | 5000 | Teto de issues por execução |
| `tenant` | `piloto-sp` | CLI: `--tenant=piloto-sp` |
| `dry_run` | **true** na 1ª execução | Obrigatório antes de apply |

Variáveis úteis (scripts Sprint 21):

```powershell
$env:BACKFILL_TENANT = "piloto-sp"
$env:BACKFILL_DAYS = "90"
$env:API_URL = "https://api.seudominio.com"   # homolog ou prod
$env:SMOKE_EMAIL = "admin@piloto.local"
$env:SMOKE_PASSWORD = "***"
```

---

## 5. Fluxo recomendado (homolog → produção)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Dry-run    │ ──► │ Contador OK  │ ──► │ PO autoriza │ ──► │   Apply      │
│  (sem write)│     │ (se > 0 cand)│     │   apply     │     │  (com write) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                                                                    │
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │ Dry-run pós-apply│
                                                          │ candidates: 0    │
                                                          └──────────────────┘
```

**Regra de ouro:** se `errors > 0` no dry-run → **não aplicar** até investigar.

---

## 6. Execução — Homologação

### 6.1 Dry-run (CLI)

No host com acesso ao banco de homolog:

```powershell
cd exeq-nfse-core
# .env com DATABASE_URL / MIGRATION_DATABASE_URL de homolog

npm run sprint21:backfill:dry-run
# ou
npm run backfill:snapshots:dry-run
# ou com parâmetros:
npm run backfill:snapshots -- --dry-run --days=90 --tenant=piloto-sp
```

**Registrar na evidência:**

- `candidates`, `created` (simulado), `skipped`, `errors`, `dry_run: true`

### 6.2 Dry-run (API admin) — opcional, recomendado

Valida rota deployada + RBAC:

```powershell
$env:API_URL = "https://api-homolog.seudominio.com"
npm run sprint21:backfill:api-dry-run
```

Equivalente manual:

```http
POST /v1/fiscal/admin/backfill-snapshots
Authorization: Bearer <tenant_admin JWT>
Content-Type: application/json

{ "days": 90, "dry_run": true }
```

Esperado: HTTP **200**, corpo com `dry_run: true`.

### 6.3 Gate contador (se `candidates > 0`)

Contador confirma:

- Quantidade de notas afetadas é esperada.
- Período (`days`) está correto.
- Nenhuma anomalia nos logs de emissão recentes.

### 6.4 Apply homolog (após PO autorizar)

```powershell
npm run sprint21:backfill:apply
# ou
npm run backfill:snapshots -- --days=90 --tenant=piloto-sp
```

**Esperado:** `dry_run: false`, `created` ≈ `candidates` do dry-run, `errors: 0`.

### 6.5 Validação pós-apply homolog

```powershell
npm run sprint21:backfill:api-dry-run
```

**Esperado:** `candidates: 0`.

Consulta SQL opcional (role migration):

```sql
SELECT COUNT(*) AS sem_snapshot
FROM exeq_core.nf_issue i
LEFT JOIN exeq_fiscal.tax_snapshot ts ON ts.nf_issue_id = i.id
INNER JOIN exeq_core.tenants t ON t.id = i.tenant_id
WHERE t.slug = 'piloto-sp'
  AND i.status = 'authorized'
  AND i.tax_snapshot_id IS NULL
  AND ts.id IS NULL
  AND i.created_at >= now() - interval '90 days';
```

Esperado: `0`.

---

## 7. Execução — Produção

Repetir **§6** no ambiente de produção, com adições:

1. **Backup** registrado (§3).
2. Dry-run prod **independente** do homolog (contagens podem diferir).
3. PO assina apply prod explicitamente (gate G5).
4. Monitorar API/worker durante apply; sem deploy paralelo.

Mesmos comandos, `.env` e `API_URL` de **produção**.

---

## 8. Interpretação de resultados

| Campo | Significado |
|-------|-------------|
| `candidates` | Emissões `authorized` na janela sem snapshot |
| `created` | Snapshots criados (dry-run: simulação; apply: real) |
| `skipped` | Regra tributária não encontrada (`TaxRuleNotFoundError`) — issue ignorada |
| `errors` | Falha inesperada — investigar antes de apply |
| `dry_run` | `true` = nenhum INSERT; `false` = persistido |

### Se `skipped > 0`

- Listar issues afetadas (logs da API ou query).
- Contador revisa catálogo/regra municipal para competência/IBGE/serviço.
- **Não** reexecutar apply em loop; corrigir dados fiscais primeiro.

### Se `errors > 0`

- Abortar apply.
- Coletar stderr / logs `Erro issue <uuid>`.
- Tech Lead abre investigação; novo dry-run após correção.

---

## 9. Contingência

| Situação | Ação |
|----------|------|
| Apply interrompido | Dry-run novamente; apply é idempotente para issues **sem** snapshot |
| Apply duplicado | Seguro: query de candidatos exclui issues com `tax_snapshot_id` |
| Contagem diverge dry-run vs apply | Normal se emissões novas entraram entre etapas; documentar delta |
| Rollback de snapshot | **Não automatizado** — exige intervenção DBA + decisão contador/PO |

---

## 10. Evidência (obrigatória)

Criar arquivo por ambiente:

`docs/evidencias/BACKFILL_PROD_<AMBIENTE>_<YYYY-MM-DD>.md`

Template mínimo:

```markdown
# Backfill tax_snapshot — <homolog|prod> (YYYY-MM-DD)

- Tenant: piloto-sp
- Executor: <nome>
- Backup ID (prod): <id ou N/A homolog>
- Dry-run: candidates / errors
- PO autorizou apply: sim/não — <data>
- Apply: created / skipped / errors
- Pós-apply dry-run: candidates (esperado 0)
- Contador: <nome> — OK / N/A
```

Referência: [SPRINT21_BACKFILL_PILOTO_2026-06-22.md](../evidencias/SPRINT21_BACKFILL_PILOTO_2026-06-22.md)

---

## 11. Checklist operacional (copiar para evidência)

### Homolog

- [ ] `/health` OK
- [ ] Dry-run CLI executado
- [ ] Dry-run API executado (opcional)
- [ ] Contador revisou (se candidates > 0)
- [ ] PO autorizou apply homolog
- [ ] Apply homolog executado (`errors: 0`)
- [ ] Pós-apply: `candidates: 0`
- [ ] Evidência arquivada

### Produção

- [ ] Backup banco registrado
- [ ] Dry-run prod executado
- [ ] Contador revisou (se candidates > 0)
- [ ] PO autorizou apply prod
- [ ] Apply prod executado (`errors: 0`)
- [ ] Pós-apply: `candidates: 0`
- [ ] Evidência arquivada
- [ ] PO encerra Opção A

---

## 12. Comandos rápidos

```powershell
cd exeq-nfse-core

# Gate homolog (G1 dry-run CLI + API + evidência)
npm run sprint21:backfill:homolog-gate

# Apply homolog (requer PO_APPLY_AUTHORIZED=true e candidates > 0)
$env:PO_APPLY_AUTHORIZED = "true"
npm run sprint21:backfill:homolog-apply

# Gate/apply produção
$env:BACKFILL_ENV = "prod"
$env:PO_APPLY_AUTHORIZED = "true"
npm run sprint21:backfill:homolog-gate
npm run sprint21:backfill:homolog-apply

# Comandos avulsos
npm run sprint21:backfill:dry-run
npm run sprint21:backfill:apply
$env:API_URL = "https://..."
npm run sprint21:backfill:api-dry-run

# Testes regressão Sprint 21 (CI/local)
npm run test:sprint21
```

---

## 13. Referências

- [KICKOFF_DESENVOLVIMENTO_SPRINT21.md](../KICKOFF_DESENVOLVIMENTO_SPRINT21.md)
- [RFC-0020 README — backfill](../rfc-0020/README.md)
- [DEPLOY_PRODUCAO.md](../DEPLOY_PRODUCAO.md)
