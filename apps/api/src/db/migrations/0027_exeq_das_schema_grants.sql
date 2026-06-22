-- Fix grants exeq_das para role exeq_app (ambientes que aplicaram 0026 antes do GRANT USAGE)
GRANT USAGE ON SCHEMA exeq_das TO exeq_app;
GRANT SELECT, INSERT, UPDATE ON exeq_das.guia_fiscal TO exeq_app;
