-- RFC-0020 Sprint 2 — legislação transição + tax_rate_entries (sandbox LC214)

CREATE TABLE IF NOT EXISTS exeq_fiscal.tax_rate_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legislation_version_id UUID NOT NULL REFERENCES exeq_fiscal.legislation_versions(id),
  tax_type VARCHAR(16) NOT NULL,
  ibge_code CHAR(7),
  service_code VARCHAR(16),
  c_class_trib VARCHAR(16),
  rate_percent NUMERIC(8,4) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_resolve ON exeq_fiscal.tax_rate_entries
  (legislation_version_id, tax_type, ibge_code, service_code, valid_from, valid_to);

-- Versões de transição
INSERT INTO exeq_fiscal.legislation_versions (code, title, valid_from, valid_to, metadata)
VALUES
  (
    'TRANSITION-2027-v1',
    'Transição IBS/CBS — fase teste 2027',
    '2027-01-01',
    '2029-12-31',
    '{"status":"sandbox","phase":"test"}'::jsonb
  ),
  (
    'TRANSITION-2029-v2',
    'Transição IBS/CBS — fase redução ISS 2030+',
    '2030-01-01',
    '2032-12-31',
    '{"status":"sandbox","phase":"iss_reduction"}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

-- Seed alíquotas sandbox IBS/CBS (valores ilustrativos — substituir por NT oficial)
INSERT INTO exeq_fiscal.tax_rate_entries (
  legislation_version_id, tax_type, ibge_code, service_code, rate_percent, valid_from, valid_to, metadata
)
SELECT lv.id, v.tax_type, NULL, NULL, v.rate_percent, lv.valid_from, lv.valid_to, v.metadata
FROM exeq_fiscal.legislation_versions lv
CROSS JOIN (
  VALUES
    ('TRANSITION-2027-v1', 'ibs', 0.1000::numeric, '{"note":"0.1% sandbox"}'::jsonb),
    ('TRANSITION-2027-v1', 'cbs', 0.9000::numeric, '{"note":"0.9% sandbox"}'::jsonb),
    ('TRANSITION-2027-v1', 'iss_multiplier', 100.0000::numeric, '{"note":"100% ISS legado"}'::jsonb),
    ('TRANSITION-2029-v2', 'ibs', 0.5000::numeric, '{"note":"0.5% sandbox"}'::jsonb),
    ('TRANSITION-2029-v2', 'cbs', 0.9000::numeric, '{"note":"0.9% sandbox"}'::jsonb),
    ('TRANSITION-2029-v2', 'iss_multiplier', 50.0000::numeric, '{"note":"50% ISS legado"}'::jsonb)
) AS v(leg_code, tax_type, rate_percent, metadata)
WHERE lv.code = v.leg_code
  AND NOT EXISTS (
    SELECT 1 FROM exeq_fiscal.tax_rate_entries e
    WHERE e.legislation_version_id = lv.id AND e.tax_type = v.tax_type
  );

GRANT SELECT ON exeq_fiscal.tax_rate_entries TO exeq_app;
