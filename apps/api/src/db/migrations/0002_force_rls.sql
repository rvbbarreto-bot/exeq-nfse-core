-- Force RLS even for table owner (exeq superuser in dev)
ALTER TABLE exeq_core.users FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.fiscal_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.tax_rule_catalogs FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.municipal_tax_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE exeq_core.secret_vault FORCE ROW LEVEL SECURITY;
