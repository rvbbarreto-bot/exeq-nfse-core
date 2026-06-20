-- Application role without BYPASSRLS (superuser bypasses RLS in dev)
DO $$ BEGIN
  CREATE ROLE exeq_app LOGIN PASSWORD 'exeq_app_dev';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA exeq_core TO exeq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA exeq_core TO exeq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA exeq_core TO exeq_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA exeq_core
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO exeq_app;
