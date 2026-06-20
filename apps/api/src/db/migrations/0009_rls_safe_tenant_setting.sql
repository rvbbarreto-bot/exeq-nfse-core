-- Evita erro 22P02 quando app.tenant_id está vazio no pool de conexões
CREATE OR REPLACE FUNCTION exeq_core.safe_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('app.tenant_id', true);
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS users_tenant_isolation ON exeq_core.users;
CREATE POLICY users_tenant_isolation ON exeq_core.users
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      exeq_core.safe_tenant_id() IS NOT NULL
      AND tenant_id = exeq_core.safe_tenant_id()
    )
  );

DROP POLICY IF EXISTS fiscal_profiles_tenant_isolation ON exeq_core.fiscal_profiles;
CREATE POLICY fiscal_profiles_tenant_isolation ON exeq_core.fiscal_profiles
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS tax_rule_catalogs_tenant_isolation ON exeq_core.tax_rule_catalogs;
CREATE POLICY tax_rule_catalogs_tenant_isolation ON exeq_core.tax_rule_catalogs
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS municipal_tax_rules_tenant_isolation ON exeq_core.municipal_tax_rules;
CREATE POLICY municipal_tax_rules_tenant_isolation ON exeq_core.municipal_tax_rules
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS secret_vault_tenant_isolation ON exeq_core.secret_vault;
CREATE POLICY secret_vault_tenant_isolation ON exeq_core.secret_vault
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS providers_tenant_isolation ON exeq_core.providers;
CREATE POLICY providers_tenant_isolation ON exeq_core.providers
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS customers_tenant_isolation ON exeq_core.customers;
CREATE POLICY customers_tenant_isolation ON exeq_core.customers
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS service_catalog_tenant_isolation ON exeq_core.service_catalog_items;
CREATE POLICY service_catalog_tenant_isolation ON exeq_core.service_catalog_items
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS nf_issue_tenant_isolation ON exeq_core.nf_issue;
CREATE POLICY nf_issue_tenant_isolation ON exeq_core.nf_issue
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS nf_issue_event_tenant_isolation ON exeq_core.nf_issue_event;
CREATE POLICY nf_issue_event_tenant_isolation ON exeq_core.nf_issue_event
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS nf_artifact_tenant_isolation ON exeq_core.nf_artifact;
CREATE POLICY nf_artifact_tenant_isolation ON exeq_core.nf_artifact
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS audit_log_tenant_isolation ON exeq_core.audit_log;
CREATE POLICY audit_log_tenant_isolation ON exeq_core.audit_log
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS charge_tenant_isolation ON exeq_core.charge;
CREATE POLICY charge_tenant_isolation ON exeq_core.charge
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS payment_event_tenant_isolation ON exeq_core.payment_event;
CREATE POLICY payment_event_tenant_isolation ON exeq_core.payment_event
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS webhook_inbox_tenant_isolation ON exeq_core.webhook_inbox;
CREATE POLICY webhook_inbox_tenant_isolation ON exeq_core.webhook_inbox
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS channel_session_tenant_isolation ON exeq_core.channel_session;
CREATE POLICY channel_session_tenant_isolation ON exeq_core.channel_session
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );

DROP POLICY IF EXISTS channel_notification_tenant_isolation ON exeq_core.channel_notification;
CREATE POLICY channel_notification_tenant_isolation ON exeq_core.channel_notification
  USING (
    exeq_core.safe_tenant_id() IS NOT NULL
    AND tenant_id = exeq_core.safe_tenant_id()
  );
