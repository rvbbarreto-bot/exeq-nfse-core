-- Flags extensíveis por município (CNC / payload) — evita novas colunas por rejeição
ALTER TABLE exeq_core.municipal_emission_rules
  ADD COLUMN IF NOT EXISTS payload_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN exeq_core.municipal_emission_rules.payload_flags IS
  'Flags de payload por município (ex.: endereco_tomador_fallback). Expandir sem hardcode IBGE.';

UPDATE exeq_core.municipal_emission_rules
SET payload_flags = jsonb_build_object(
  'endereco_tomador_fallback', jsonb_build_object(
    'street', 'Rua Dona Sinha',
    'number', '100',
    'district', 'Centro',
    'zip_code', '12940000'
  )
),
updated_at = now()
WHERE ibge_code = '3504107';
