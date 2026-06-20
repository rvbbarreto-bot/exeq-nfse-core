-- Fase 3: checklist de governanca para publicacao de catalogo
ALTER TABLE exeq_core.tax_rule_catalogs
  ADD COLUMN IF NOT EXISTS publish_checklist JSONB NOT NULL DEFAULT '{"csv_validated":false,"rules_reviewed":false,"terms_accepted":false}'::jsonb;
