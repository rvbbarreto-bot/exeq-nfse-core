# Sprint 21 P1 — Backfill piloto-sp (2026-06-22)

| Campo | Valor |
|-------|-------|
| **Tenant** | piloto-sp (`adf8ddcc-ba29-4a56-a539-796c8006769d`) |
| **Janela** | 90 dias |
| **Ambiente** | local Docker Postgres `:55432` |
| **Executor** | time senior full stack (CLI + API) |

---

## S21-06 — Dry-run CLI

```json
{
  "tenant_id": "adf8ddcc-ba29-4a56-a539-796c8006769d",
  "tenant_slug": "piloto-sp",
  "days": 90,
  "candidates": 15,
  "created": 15,
  "skipped": 0,
  "errors": 0,
  "dry_run": true
}
```

Comando: `npm run sprint21:backfill:dry-run`

---

## S21-07 — Apply CLI

Pré-apply dry-run repetido (15 candidatos, 0 erros) → apply executado.

```json
{
  "tenant_id": "adf8ddcc-ba29-4a56-a539-796c8006769d",
  "tenant_slug": "piloto-sp",
  "days": 90,
  "candidates": 15,
  "created": 15,
  "skipped": 0,
  "errors": 0,
  "dry_run": false
}
```

Comando: `npm run sprint21:backfill:apply`

**Resultado:** 15 emissões `authorized` receberam `tax_snapshot` + `nf_issue.tax_snapshot_id`.

---

## S21-08 — Validação API admin (pós-apply)

`POST /v1/fiscal/admin/backfill-snapshots` com `{ "days": 90, "dry_run": true }`  
Login: `admin@piloto.local` · API: `http://localhost:3002`

HTTP 200:

```json
{
  "tenant_id": "adf8ddcc-ba29-4a56-a539-796c8006769d",
  "tenant_slug": "piloto-sp",
  "days": 90,
  "candidates": 0,
  "created": 0,
  "skipped": 0,
  "errors": 0,
  "dry_run": true
}
```

Comando: `npm run sprint21:backfill:api-dry-run`

**Interpretação:** fila esgotada — nenhuma emissão autorizada na janela ficou sem snapshot.

---

## Checklist P1

- [x] S21-06 dry-run piloto-sp
- [x] S21-07 backfill aplicado (15/15)
- [x] S21-08 evidência registrada
- [x] API admin validada pós-apply

---

## Comandos operacionais

```powershell
npm run db:infra
npm run db:setup
npm run sprint21:backfill:dry-run
npm run sprint21:backfill:apply
$env:API_URL = "http://localhost:3002"
npm run sprint21:backfill:api-dry-run
```
