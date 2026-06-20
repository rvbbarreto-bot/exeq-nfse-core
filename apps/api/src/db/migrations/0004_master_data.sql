-- Fase 2 — Master data (prestador, tomador, serviço)
CREATE TABLE IF NOT EXISTS exeq_core.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  document VARCHAR(14) NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  municipal_registration VARCHAR(32),
  tax_regime exeq_core.tax_regime NOT NULL,
  address JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document)
);

CREATE TABLE IF NOT EXISTS exeq_core.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  document VARCHAR(14) NOT NULL,
  document_type VARCHAR(4) NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
  name TEXT NOT NULL,
  email VARCHAR(255),
  address JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document)
);

CREATE TABLE IF NOT EXISTS exeq_core.service_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exeq_core.tenants(id),
  service_code VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  lc116_item VARCHAR(16),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_code)
);

CREATE INDEX IF NOT EXISTS idx_providers_tenant ON exeq_core.providers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON exeq_core.customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_catalog_tenant ON exeq_core.service_catalog_items (tenant_id);

ALTER TABLE exeq_core.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.service_catalog_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE exeq_core.providers FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.service_catalog_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS providers_tenant_isolation ON exeq_core.providers;
CREATE POLICY providers_tenant_isolation ON exeq_core.providers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS customers_tenant_isolation ON exeq_core.customers;
CREATE POLICY customers_tenant_isolation ON exeq_core.customers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS service_catalog_tenant_isolation ON exeq_core.service_catalog_items;
CREATE POLICY service_catalog_tenant_isolation ON exeq_core.service_catalog_items
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.providers TO exeq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.customers TO exeq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON exeq_core.service_catalog_items TO exeq_app;

-- Unique rule per catalog + fiscal dimensions (draft/published catalogs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_municipal_tax_rules_unique_key
  ON exeq_core.municipal_tax_rules (
    tenant_id, catalog_id, fiscal_profile_id, ibge_code, service_code, tax_regime, valid_from
  );
