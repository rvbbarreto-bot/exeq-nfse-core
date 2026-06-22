-- RFC-0020 Sprint 0 — fundação domínio fiscal (sem IBS/CBS)
-- Schema exeq_fiscal + tax_snapshot P0 + feature flags + publish history

CREATE SCHEMA IF NOT EXISTS exeq_fiscal;

-- Legislação versionada (seed LC 214 — sandbox)
CREATE TABLE IF NOT EXISTS exeq_fiscal.legislation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  source_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO exeq_fiscal.legislation_versions (code, title, valid_from, metadata)
VALUES (
  'LC214-2025-v1',
  'Lei Complementar 214/2025 — IBS/CBS (referência)',
  '2025-01-01',
  '{"status":"sandbox","note":"Sprint 0 seed — alíquotas IBS/CBS não ativas"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- Snapshot fiscal imutável (append-only)
CREATE TABLE IF NOT EXISTS exeq_fiscal.tax_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  nf_issue_id UUID REFERENCES exeq_core.nf_issue(id),
  catalog_id UUID REFERENCES exeq_core.tax_rule_catalogs(id),
  catalog_version INT,
  legislation_version_id UUID REFERENCES exeq_fiscal.legislation_versions(id),
  legislation_code VARCHAR(64) NOT NULL DEFAULT 'ISS-LEGACY-v1',
  engine VARCHAR(32) NOT NULL DEFAULT 'iss_legacy',
  municipio_origem_ibge CHAR(7),
  municipio_destino_ibge CHAR(7) NOT NULL,
  resolved_taxes JSONB NOT NULL,
  future_taxes JSONB NOT NULL DEFAULT '{}',
  payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_snapshot_nf_issue
  ON exeq_fiscal.tax_snapshot (nf_issue_id)
  WHERE nf_issue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tax_snapshot_tenant_created
  ON exeq_fiscal.tax_snapshot (tenant_id, created_at DESC);

-- Impede UPDATE/DELETE (ADR-003)
CREATE OR REPLACE FUNCTION exeq_fiscal.deny_tax_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tax_snapshot is append-only';
END;
$$;

DROP TRIGGER IF EXISTS tax_snapshot_immutable ON exeq_fiscal.tax_snapshot;
CREATE TRIGGER tax_snapshot_immutable
  BEFORE UPDATE OR DELETE ON exeq_fiscal.tax_snapshot
  FOR EACH ROW EXECUTE FUNCTION exeq_fiscal.deny_tax_snapshot_mutation();

-- Feature flags por tenant
CREATE TABLE IF NOT EXISTS exeq_core.tenant_feature_flags (
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id) ON DELETE CASCADE,
  flag_key VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES exeq_core.users(id),
  PRIMARY KEY (tenant_id, flag_key)
);

-- Histórico de publicação de catálogo
CREATE TABLE IF NOT EXISTS exeq_core.tax_catalog_publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  catalog_id UUID NOT NULL REFERENCES exeq_core.tax_rule_catalogs(id),
  catalog_version INT NOT NULL,
  action VARCHAR(32) NOT NULL DEFAULT 'published',
  previous_catalog_id UUID REFERENCES exeq_core.tax_rule_catalogs(id),
  published_by UUID REFERENCES exeq_core.users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_catalog_publish_history_tenant
  ON exeq_core.tax_catalog_publish_history (tenant_id, published_at DESC);

-- FK nf_issue → tax_snapshot (dual-write Sprint 0)
ALTER TABLE exeq_core.nf_issue
  ADD COLUMN IF NOT EXISTS tax_snapshot_id UUID REFERENCES exeq_fiscal.tax_snapshot(id);

-- Seed flags default (desligadas) para tenants existentes
INSERT INTO exeq_core.tenant_feature_flags (tenant_id, flag_key, enabled)
SELECT t.id, f.flag_key, false
FROM exeq_core.tenants t
CROSS JOIN (
  VALUES
    ('FEATURE_IBS'),
    ('FEATURE_CBS'),
    ('FEATURE_PREVIEW_TAX'),
    ('FEATURE_ACCOUNTANT_PORTAL'),
    ('FEATURE_TRANSITION_MODE')
) AS f(flag_key)
ON CONFLICT (tenant_id, flag_key) DO NOTHING;

-- RLS
ALTER TABLE exeq_fiscal.tax_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_fiscal.tax_snapshot FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_snapshot_tenant_isolation ON exeq_fiscal.tax_snapshot;
CREATE POLICY tax_snapshot_tenant_isolation ON exeq_fiscal.tax_snapshot
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      exeq_core.safe_tenant_id() IS NOT NULL
      AND tenant_id = exeq_core.safe_tenant_id()
    )
  );

ALTER TABLE exeq_core.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.tenant_feature_flags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_feature_flags_isolation ON exeq_core.tenant_feature_flags;
CREATE POLICY tenant_feature_flags_isolation ON exeq_core.tenant_feature_flags
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      exeq_core.safe_tenant_id() IS NOT NULL
      AND tenant_id = exeq_core.safe_tenant_id()
    )
  );

ALTER TABLE exeq_core.tax_catalog_publish_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.tax_catalog_publish_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_publish_history_isolation ON exeq_core.tax_catalog_publish_history;
CREATE POLICY catalog_publish_history_isolation ON exeq_core.tax_catalog_publish_history
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      exeq_core.safe_tenant_id() IS NOT NULL
      AND tenant_id = exeq_core.safe_tenant_id()
    )
  );

-- legislation_versions: leitura global para app
GRANT USAGE ON SCHEMA exeq_fiscal TO exeq_app;
GRANT SELECT ON exeq_fiscal.legislation_versions TO exeq_app;
GRANT SELECT, INSERT ON exeq_fiscal.tax_snapshot TO exeq_app;

GRANT SELECT, INSERT, UPDATE ON exeq_core.tenant_feature_flags TO exeq_app;
GRANT SELECT, INSERT ON exeq_core.tax_catalog_publish_history TO exeq_app;
