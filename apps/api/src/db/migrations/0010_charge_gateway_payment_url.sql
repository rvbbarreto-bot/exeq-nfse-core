-- Sprint 10 — URL de pagamento gateway + índice vínculo NF↔cobrança
ALTER TABLE exeq_core.charge
  ADD COLUMN IF NOT EXISTS gateway_payment_url TEXT;

CREATE INDEX IF NOT EXISTS idx_charge_tenant_nf_issue
  ON exeq_core.charge (tenant_id, nf_issue_id)
  WHERE nf_issue_id IS NOT NULL;
