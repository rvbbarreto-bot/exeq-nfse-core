-- Corrige address JSONB salvo como string escapada (double-encoding).
UPDATE exeq_core.customers
SET address = (address #>> '{}')::jsonb,
    updated_at = now()
WHERE jsonb_typeof(address) = 'string'
  AND (address #>> '{}') ~ '^\{';

UPDATE exeq_core.providers
SET address = (address #>> '{}')::jsonb,
    updated_at = now()
WHERE jsonb_typeof(address) = 'string'
  AND (address #>> '{}') ~ '^\{';
