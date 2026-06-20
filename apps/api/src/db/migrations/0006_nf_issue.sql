-- Fase 4 — emissao NFS-e (NfIssue state machine + audit)
DO $$ BEGIN
  CREATE TYPE exeq_core.nf_issue_status AS ENUM (
    'draft', 'pending_tax', 'queued', 'submitting', 'polling',
    'authorized', 'rejected', 'cancelled', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS exeq_core.nf_issue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  idempotency_key VARCHAR(128) NOT NULL,
  status exeq_core.nf_issue_status NOT NULL DEFAULT 'draft',
  provider_id UUID NOT NULL REFERENCES exeq_core.providers(id),
  customer_id UUID NOT NULL REFERENCES exeq_core.customers(id),
  service_id UUID NOT NULL REFERENCES exeq_core.service_catalog_items(id),
  ibge_code VARCHAR(7) NOT NULL,
  competence_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  resolved_rule_id UUID REFERENCES exeq_core.municipal_tax_rules(id),
  resolved_params JSONB,
  internal_payload JSONB,
  focus_ref VARCHAR(128),
  focus_status_raw JSONB,
  payload_hash VARCHAR(64),
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS exeq_core.nf_issue_event (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  nf_issue_id UUID NOT NULL REFERENCES exeq_core.nf_issue(id) ON DELETE CASCADE,
  from_status exeq_core.nf_issue_status,
  to_status exeq_core.nf_issue_status NOT NULL,
  actor VARCHAR(64) NOT NULL,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exeq_core.nf_artifact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  nf_issue_id UUID NOT NULL REFERENCES exeq_core.nf_issue(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('xml', 'pdf')),
  storage_path TEXT NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exeq_core.audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  entity_type VARCHAR(64) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(64) NOT NULL,
  payload_hash VARCHAR(64),
  metadata JSONB,
  actor VARCHAR(64) NOT NULL DEFAULT 'system',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nf_issue_tenant_status_created
  ON exeq_core.nf_issue (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nf_issue_event_issue
  ON exeq_core.nf_issue_event (nf_issue_id, occurred_at);

ALTER TABLE exeq_core.nf_issue ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.nf_issue FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.nf_issue_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.nf_issue_event FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.nf_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.nf_artifact FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nf_issue_tenant_isolation ON exeq_core.nf_issue;
CREATE POLICY nf_issue_tenant_isolation ON exeq_core.nf_issue
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS nf_issue_event_tenant_isolation ON exeq_core.nf_issue_event;
CREATE POLICY nf_issue_event_tenant_isolation ON exeq_core.nf_issue_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS nf_artifact_tenant_isolation ON exeq_core.nf_artifact;
CREATE POLICY nf_artifact_tenant_isolation ON exeq_core.nf_artifact
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS audit_log_tenant_isolation ON exeq_core.audit_log;
CREATE POLICY audit_log_tenant_isolation ON exeq_core.audit_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.nf_issue TO exeq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.nf_issue_event TO exeq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.nf_artifact TO exeq_app;
GRANT SELECT, INSERT ON exeq_core.audit_log TO exeq_app;
GRANT USAGE, SELECT ON SEQUENCE exeq_core.nf_issue_event_id_seq TO exeq_app;
GRANT USAGE, SELECT ON SEQUENCE exeq_core.audit_log_id_seq TO exeq_app;
