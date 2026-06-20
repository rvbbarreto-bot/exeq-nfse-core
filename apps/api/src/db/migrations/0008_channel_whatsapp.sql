-- Fase 8 — canal WhatsApp (sessoes conversacionais + notificacoes)
DO $$ BEGIN
  ALTER TYPE exeq_core.secret_kind ADD VALUE 'channel_token';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exeq_core.channel_session_status AS ENUM (
    'collecting', 'ready_to_confirm', 'emitted', 'expired', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exeq_core.channel_notification_status AS ENUM (
    'pending', 'sent', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS exeq_core.channel_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  idempotency_key VARCHAR(128) NOT NULL,
  phone_e164 VARCHAR(20) NOT NULL,
  status exeq_core.channel_session_status NOT NULL DEFAULT 'collecting',
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  nf_issue_id UUID REFERENCES exeq_core.nf_issue(id),
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS exeq_core.channel_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  session_id UUID REFERENCES exeq_core.channel_session(id),
  nf_issue_id UUID REFERENCES exeq_core.nf_issue(id),
  phone_e164 VARCHAR(20) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  message_body TEXT NOT NULL,
  status exeq_core.channel_notification_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_channel_session_tenant_phone
  ON exeq_core.channel_session (tenant_id, phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_session_issue
  ON exeq_core.channel_session (nf_issue_id);

CREATE INDEX IF NOT EXISTS idx_channel_notification_pending
  ON exeq_core.channel_notification (tenant_id, status, created_at);

ALTER TABLE exeq_core.channel_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_session FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_notification FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_session_tenant_isolation ON exeq_core.channel_session;
CREATE POLICY channel_session_tenant_isolation ON exeq_core.channel_session
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS channel_notification_tenant_isolation ON exeq_core.channel_notification;
CREATE POLICY channel_notification_tenant_isolation ON exeq_core.channel_notification
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON exeq_core.channel_session TO exeq_app;
GRANT SELECT, INSERT, UPDATE ON exeq_core.channel_notification TO exeq_app;
