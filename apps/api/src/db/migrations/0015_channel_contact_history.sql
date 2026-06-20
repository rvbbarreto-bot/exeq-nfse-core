-- Canal WhatsApp — contato recorrente + histórico de mensagens (atendimento humanizado)

CREATE TABLE IF NOT EXISTS exeq_core.channel_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  phone_e164 VARCHAR(20) NOT NULL,
  display_name VARCHAR(255),
  last_successful_draft JSONB,
  last_nf_issue_id UUID REFERENCES exeq_core.nf_issue(id),
  total_emissions INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_e164)
);

CREATE TABLE IF NOT EXISTS exeq_core.channel_message_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  contact_id UUID REFERENCES exeq_core.channel_contact(id),
  session_id UUID REFERENCES exeq_core.channel_session(id),
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_id VARCHAR(128),
  message_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_contact_tenant_phone
  ON exeq_core.channel_contact (tenant_id, phone_e164);

CREATE INDEX IF NOT EXISTS idx_channel_message_log_contact
  ON exeq_core.channel_message_log (tenant_id, contact_id, created_at DESC);

ALTER TABLE exeq_core.channel_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_contact FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_message_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_contact_tenant_isolation ON exeq_core.channel_contact;
CREATE POLICY channel_contact_tenant_isolation ON exeq_core.channel_contact
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS channel_message_log_tenant_isolation ON exeq_core.channel_message_log;
CREATE POLICY channel_message_log_tenant_isolation ON exeq_core.channel_message_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON exeq_core.channel_contact TO exeq_app;
GRANT SELECT, INSERT ON exeq_core.channel_message_log TO exeq_app;
GRANT USAGE, SELECT ON SEQUENCE exeq_core.channel_message_log_id_seq TO exeq_app;
