-- exeq-nfse-core Fase 1 — schema inicial + RLS
CREATE SCHEMA IF NOT EXISTS exeq_core;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE exeq_core.tenant_status AS ENUM ('active', 'suspended', 'provisioning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exeq_core.tax_regime AS ENUM ('simples_nacional', 'lucro_presumido', 'lucro_real');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exeq_core.catalog_status AS ENUM ('draft', 'published', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exeq_core.secret_kind AS ENUM ('focus_token', 'gateway_key', 'webhook_secret');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS exeq_core.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  document VARCHAR(14),
  status exeq_core.tenant_status NOT NULL DEFAULT 'active',
  focus_layout VARCHAR(16) NOT NULL DEFAULT 'nfsen',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exeq_core.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS exeq_core.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exeq_core.user_roles (
  user_id UUID NOT NULL REFERENCES exeq_core.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES exeq_core.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS exeq_core.fiscal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  name TEXT NOT NULL,
  tax_regime exeq_core.tax_regime NOT NULL,
  iss_retention_policy VARCHAR(32) NOT NULL DEFAULT 'by_rule',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS exeq_core.tax_rule_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  version INT NOT NULL,
  status exeq_core.catalog_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);

CREATE TABLE IF NOT EXISTS exeq_core.municipal_tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  catalog_id UUID NOT NULL REFERENCES exeq_core.tax_rule_catalogs(id) ON DELETE CASCADE,
  fiscal_profile_id UUID NOT NULL REFERENCES exeq_core.fiscal_profiles(id),
  ibge_code CHAR(7) NOT NULL,
  municipio_nome TEXT NOT NULL,
  uf CHAR(2) NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  service_description TEXT NOT NULL,
  tax_regime exeq_core.tax_regime NOT NULL,
  iss_rate NUMERIC(7,4) NOT NULL,
  iss_retained BOOLEAN NOT NULL,
  irrf_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  pis_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  cofins_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  csll_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  simples_codigo_tributacao SMALLINT,
  valid_from DATE NOT NULL,
  valid_to DATE,
  priority INT NOT NULL DEFAULT 100,
  focus_field_overrides JSONB NOT NULL DEFAULT '{}',
  observacao_contador TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exeq_core.secret_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  kind exeq_core.secret_kind NOT NULL,
  ciphertext BYTEA NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind)
);

CREATE TABLE IF NOT EXISTS exeq_core.schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_municipal_tax_rules_resolve
  ON exeq_core.municipal_tax_rules (tenant_id, ibge_code, service_code, tax_regime, valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_municipal_tax_rules_catalog
  ON exeq_core.municipal_tax_rules (catalog_id);

-- RLS
ALTER TABLE exeq_core.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.tax_rule_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.municipal_tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.secret_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_tenant_isolation ON exeq_core.users;
CREATE POLICY users_tenant_isolation ON exeq_core.users
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR tenant_id = current_setting('app.tenant_id', true)::uuid
  );

DROP POLICY IF EXISTS fiscal_profiles_tenant_isolation ON exeq_core.fiscal_profiles;
CREATE POLICY fiscal_profiles_tenant_isolation ON exeq_core.fiscal_profiles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tax_rule_catalogs_tenant_isolation ON exeq_core.tax_rule_catalogs;
CREATE POLICY tax_rule_catalogs_tenant_isolation ON exeq_core.tax_rule_catalogs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS municipal_tax_rules_tenant_isolation ON exeq_core.municipal_tax_rules;
CREATE POLICY municipal_tax_rules_tenant_isolation ON exeq_core.municipal_tax_rules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS secret_vault_tenant_isolation ON exeq_core.secret_vault;
CREATE POLICY secret_vault_tenant_isolation ON exeq_core.secret_vault
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Seed roles (global, no RLS)
INSERT INTO exeq_core.roles (code, name) VALUES
  ('tenant_admin', 'Administrador do tenant'),
  ('operator', 'Operador'),
  ('accountant', 'Contador'),
  ('readonly', 'Somente leitura')
ON CONFLICT (code) DO NOTHING;
