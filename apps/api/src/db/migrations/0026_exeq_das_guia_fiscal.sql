-- Merge DAS Fase 1 — guias DAS/DARF (adaptado de cobranca-saas-api migration 028)
CREATE SCHEMA IF NOT EXISTS exeq_das;

CREATE TABLE IF NOT EXISTS exeq_das.guia_fiscal (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES exeq_core.tenants(id),
  provider_id         UUID NOT NULL REFERENCES exeq_core.providers(id),
  tipo_guia           TEXT NOT NULL CHECK (tipo_guia IN ('DAS', 'DARF')),
  competencia         TEXT NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
  data_vencimento     DATE,
  valor_principal     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor_principal >= 0),
  valor_multa         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor_multa >= 0),
  valor_juros         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (valor_juros >= 0),
  valor_total         NUMERIC(14, 2) GENERATED ALWAYS AS (
    COALESCE(valor_principal, 0) + COALESCE(valor_multa, 0) + COALESCE(valor_juros, 0)
  ) STORED,
  linha_digitavel     TEXT,
  pix_copia_cola      TEXT,
  status              TEXT NOT NULL DEFAULT 'PROCESSANDO'
    CHECK (status IN (
      'PROCESSANDO', 'DISPONIVEL', 'PAGO', 'CANCELADO',
      'RETIFICADO', 'VENCIDO', 'EM_CONTESTACAO'
    )),
  compliance_status   TEXT NOT NULL DEFAULT 'pendente'
    CHECK (compliance_status IN ('pendente', 'aprovado', 'bloqueado', 'dispensado')),
  compliance_motivo   TEXT,
  pdf_storage_key     TEXT,
  versao_atual        INT NOT NULL DEFAULT 1 CHECK (versao_atual >= 1),
  idempotency_key     TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_exeq_das_guia_idempotency UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT uq_exeq_das_guia_competencia UNIQUE (
    tenant_id, provider_id, tipo_guia, competencia, versao_atual
  )
);

CREATE INDEX IF NOT EXISTS idx_exeq_das_guia_tenant_status
  ON exeq_das.guia_fiscal (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exeq_das_guia_tenant_provider
  ON exeq_das.guia_fiscal (tenant_id, provider_id, competencia DESC);

ALTER TABLE exeq_das.guia_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_das.guia_fiscal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exeq_das_guia_tenant_isolation ON exeq_das.guia_fiscal;
CREATE POLICY exeq_das_guia_tenant_isolation ON exeq_das.guia_fiscal
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT USAGE ON SCHEMA exeq_das TO exeq_app;
GRANT SELECT, INSERT, UPDATE ON exeq_das.guia_fiscal TO exeq_app;
