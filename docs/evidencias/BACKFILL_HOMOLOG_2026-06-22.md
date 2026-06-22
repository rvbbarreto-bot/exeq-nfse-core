# Backfill tax_snapshot — homolog (2026-06-22)

| Campo | Valor |
|-------|-------|
| **Ambiente** | homolog |
| **Tenant** | piloto-sp |
| **Janela** | 90 dias |
| **Fase** | concluído — fila vazia |
| **PO apply autorizado** | não |

## G1 — Dry-run CLI

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

## Dry-run API

HTTP 200

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

## Notas

- Nenhuma emissão authorized sem snapshot na janela.
- Apply não necessário.

## Checklist runbook

- [x] G1 dry-run CLI
- [x] Dry-run API
- [ ] Apply executado
- [ ] Pós-apply validado
