-- Fase 6 — cobranca + webhooks (charge, payment_event, webhook_inbox)
DO $$ BEGIN
  CREATE TYPE exeq_core.charge_status AS ENUM (
    'pending', 'registered', 'paid', 'overdue', 'cancelled', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exeq_core.webhook_inbox_status AS ENUM (
    'received', 'processing', 'processed', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS exeq_core.charge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  idempotency_key VARCHAR(128) NOT NULL,
  status exeq_core.charge_status NOT NULL DEFAULT 'pending',
  customer_id UUID NOT NULL REFERENCES exeq_core.customers(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  due_date DATE NOT NULL,
  description TEXT,
  gateway_ref VARCHAR(128),
  nf_issue_id UUID REFERENCES exeq_core.nf_issue(id),
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS exeq_core.payment_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  charge_id UUID NOT NULL REFERENCES exeq_core.charge(id),
  webhook_inbox_id UUID,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  paid_at TIMESTAMPTZ NOT NULL,
  gateway_ref VARCHAR(128),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exeq_core.webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  idempotency_key VARCHAR(128) NOT NULL,
  status exeq_core.webhook_inbox_status NOT NULL DEFAULT 'received',
  signature VARCHAR(256),
  raw_payload JSONB NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE exeq_core.payment_event
  DROP CONSTRAINT IF EXISTS payment_event_webhook_inbox_id_fkey;

ALTER TABLE exeq_core.payment_event
  ADD CONSTRAINT payment_event_webhook_inbox_id_fkey
  FOREIGN KEY (webhook_inbox_id) REFERENCES exeq_core.webhook_inbox(id);

CREATE INDEX IF NOT EXISTS idx_charge_tenant_status_created
  ON exeq_core.charge (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_event_charge
  ON exeq_core.payment_event (charge_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_tenant_status
  ON exeq_core.webhook_inbox (tenant_id, status, created_at DESC);

ALTER TABLE exeq_core.charge ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.charge FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.payment_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.payment_event FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.webhook_inbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS charge_tenant_isolation ON exeq_core.charge;
CREATE POLICY charge_tenant_isolation ON exeq_core.charge
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS payment_event_tenant_isolation ON exeq_core.payment_event;
CREATE POLICY payment_event_tenant_isolation ON exeq_core.payment_event
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS webhook_inbox_tenant_isolation ON exeq_core.webhook_inbox;
CREATE POLICY webhook_inbox_tenant_isolation ON exeq_core.webhook_inbox
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.charge TO exeq_app;
GRANT SELECT, INSERT ON exeq_core.payment_event TO exeq_app;
GRANT SELECT, INSERT, UPDATE ON exeq_core.webhook_inbox TO exeq_app;
