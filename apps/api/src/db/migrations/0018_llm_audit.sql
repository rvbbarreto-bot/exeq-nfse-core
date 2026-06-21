-- FASE 2 — novos status de sessão + auditoria LLM

DO $$ BEGIN
  ALTER TYPE exeq_core.channel_session_status ADD VALUE 'emitting';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE exeq_core.channel_session_status ADD VALUE 'error';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE exeq_core.channel_session_status ADD VALUE 'pending_review';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS exeq_core.channel_llm_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  session_id UUID REFERENCES exeq_core.channel_session(id),
  message_id VARCHAR(128),
  input_text TEXT NOT NULL,
  current_draft_snapshot JSONB,
  extracted_fields JSONB,
  missing_fields TEXT[],
  confidence_score NUMERIC(4, 3),
  ambiguous_fields TEXT[],
  detected_intent VARCHAR(32),
  raw_llm_response TEXT,
  model_used VARCHAR(64),
  tokens_used INT,
  latency_ms INT,
  was_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_llm_log_session
  ON exeq_core.channel_llm_log (tenant_id, session_id, created_at DESC);

ALTER TABLE exeq_core.channel_llm_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.channel_llm_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_llm_log_tenant_isolation ON exeq_core.channel_llm_log;
CREATE POLICY channel_llm_log_tenant_isolation ON exeq_core.channel_llm_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON exeq_core.channel_llm_log TO exeq_app;
GRANT USAGE, SELECT ON SEQUENCE exeq_core.channel_llm_log_id_seq TO exeq_app;
