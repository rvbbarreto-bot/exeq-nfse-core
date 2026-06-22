# Kickoff — Sprint 21 (RFC pós-Sprint 3)

| Campo | Valor |
|-------|-------|
| **Base** | `exeq-nfse-core` |
| **Início** | 2026-06-21 |
| **Anterior** | Release 19 + Sprint 20 encerradas — [KICKOFF_ENCERRAMENTO_RELEASE19_SPRINT20.md](./KICKOFF_ENCERRAMENTO_RELEASE19_SPRINT20.md) |
| **Autorização PO** | Encerrar Release 19; testes E2E WhatsApp em sprint de QA futura · **Opção A backfill prod** (2026-06-22) |
| **Status** | **P1 local OK** — **Opção A em execução** (runbook homolog/prod) |

---

## Objetivo

Operacionalizar o **backfill de `tax_snapshot`** (RFC-0020 pós-Sprint 3) via API admin, mantendo CLI existente para jobs batch.

---

## Backlog Sprint 21

### P0 — Backfill snapshots

| ID | Story | Critério de aceite |
|----|-------|-------------------|
| S21-01 | Rota admin backfill | `POST /v1/fiscal/admin/backfill-snapshots` (tenant_admin) |
| S21-02 | Escopo por tenant JWT | `tenantId` do token; sem cross-tenant |
| S21-03 | Dry-run | `{ "dry_run": true }` → 200, sem INSERT |
| S21-04 | Service extraído | `backfill-tax-snapshot.service.ts` + CLI/script compatível |
| S21-05 | Testes sprint 21 | `npm run test:sprint21` verde |

### P1 — Operação piloto (manual)

| ID | Story | Notas |
|----|-------|-------|
| S21-06 | Dry-run piloto-sp | ✅ 15 candidatos — [evidência](./evidencias/SPRINT21_BACKFILL_PILOTO_2026-06-22.md) |
| S21-07 | Aplicar backfill | ✅ 15 snapshots criados (0 skipped, 0 errors) |
| S21-08 | Evidência | ✅ CLI + API pós-apply (`candidates: 0`) |

### P2 — Deferido

| ID | Story | Sprint alvo |
|----|-------|-------------|
| S21-D1 | Botão admin UI backfill | Sprint 22 (após Opção A concluída) |
| S21-D2 | QA WhatsApp Release 19 | Sprint QA dedicada |
| S21-D3 | RFC #14 preview preditivo canal | Backlog fiscal |

### Opção A — Runbook produção (autorizado PO 2026-06-22)

| Item | Documento |
|------|-----------|
| Autorização PO | [AUTORIZACAO_PO_OPCAO_A_BACKFILL_PRODUCAO.md](./AUTORIZACAO_PO_OPCAO_A_BACKFILL_PRODUCAO.md) |
| Runbook ops | [runbooks/RUNBOOK_BACKFILL_TAX_SNAPSHOT_PRODUCAO.md](./runbooks/RUNBOOK_BACKFILL_TAX_SNAPSHOT_PRODUCAO.md) |
| Evidência homolog | [evidencias/BACKFILL_HOMOLOG_2026-06-22.md](./evidencias/BACKFILL_HOMOLOG_2026-06-22.md) |
| Gate automatizado | `npm run sprint21:backfill:homolog-gate` |

---

## API

```http
POST /v1/fiscal/admin/backfill-snapshots
Authorization: Bearer <tenant_admin>
Content-Type: application/json

{
  "days": 90,
  "limit": 5000,
  "dry_run": true
}
```

Resposta (200 dry-run / 201 apply):

```json
{
  "tenant_id": "...",
  "tenant_slug": "piloto-sp",
  "days": 90,
  "candidates": 12,
  "created": 12,
  "skipped": 0,
  "errors": 0,
  "dry_run": true
}
```

---

## Comandos

```powershell
cd exeq-nfse-core
npm run test:sprint21
npm run backfill:snapshots:dry-run
npm run backfill:snapshots
npm run sprint21:backfill:dry-run
npm run sprint21:backfill:apply
npm run sprint21:backfill:api-dry-run
```

---

## Definition of Done Sprint 21

1. `test:sprint21` verde
2. API admin backfill documentada e restrita a `tenant_admin`
3. CLI `backfill:snapshots` inalterado para operação batch
4. PO/contador validam dry-run em ambiente piloto (manual P1) — ✅ evidência local 2026-06-22
5. Opção A runbook homolog/prod — 🔄 em execução ([runbook](./runbooks/RUNBOOK_BACKFILL_TAX_SNAPSHOT_PRODUCAO.md))
