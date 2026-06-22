-- RFC-0020 Marco 2029 — schema split payment (sandbox, sem billing real)

ALTER TABLE exeq_fiscal.tax_snapshot
  ADD COLUMN IF NOT EXISTS split_payment JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN exeq_fiscal.tax_snapshot.split_payment IS
  'Repartição IBS/CBS sandbox v1 — ver @exeq/shared split-payment.ts';
