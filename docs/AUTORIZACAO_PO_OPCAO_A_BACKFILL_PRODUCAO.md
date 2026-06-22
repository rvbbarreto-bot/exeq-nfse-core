# Autorização PO — Opção A (Runbook backfill produção)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-06-22 |
| **Autorizador** | PO (Ricardo) |
| **Decisão** | Iniciar **Opção A** — runbook de produção para backfill `tax_snapshot` |
| **Continuidade** | **2026-06-22** — PO autoriza seguir com execução (homolog → prod) |
| **Referência Tech Lead** | Runbook antes de Sprint 22 (botão admin); operação única/rara via procedimento controlado |
| **Runbook** | [RUNBOOK_BACKFILL_TAX_SNAPSHOT_PRODUCAO.md](./runbooks/RUNBOOK_BACKFILL_TAX_SNAPSHOT_PRODUCAO.md) |

---

## Escopo autorizado

1. Elaborar e seguir runbook de backfill em **homologação** e, após aceite, em **produção**.
2. Executar **dry-run obrigatório** antes de qualquer apply.
3. Registrar evidências em `docs/evidencias/`.
4. Validar resultado com contador quando `candidates > 0`.

## Fora de escopo (mantido deferido)

- Sprint 22 — botão admin no portal (self-service UI).
- Alterações de código ou novas features nesta autorização.

---

## Gates de aprovação

| Gate | Quem | Quando |
|------|------|--------|
| G1 — Dry-run homolog | Ops / Dev | Antes de apply homolog |
| G2 — Aceite contador | Contador piloto | Se dry-run homolog > 0 candidatos |
| G3 — Autorização apply homolog | PO | ✅ Autorizado 2026-06-22 (seguir desenvolvimento) |
| G4 — Dry-run produção | Ops / Dev | Antes de apply produção |
| G5 — Autorização apply produção | PO | Após G4 e evidência homolog OK |

---

## Definition of Done — Opção A

- [x] Runbook publicado e revisado
- [x] Dry-run homolog executado e arquivado — [BACKFILL_HOMOLOG_2026-06-22.md](./evidencias/BACKFILL_HOMOLOG_2026-06-22.md) (0 candidatos — apply N/A)
- [x] Apply homolog (se candidatos > 0) com evidência — N/A (fila vazia)
- [ ] Dry-run produção executado e arquivado
- [ ] Apply produção autorizado pelo PO e executado
- [ ] Pós-apply: API/CLI com `candidates: 0` na janela acordada
- [ ] PO assina encerramento Opção A
