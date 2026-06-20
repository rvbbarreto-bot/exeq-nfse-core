-- Multi-provider NFS-e — roteamento municipal + metadados na emissão
DO $$ BEGIN
  CREATE TYPE exeq_core.nfse_provider_kind AS ENUM ('focus_nacional', 'betha');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE exeq_core.secret_kind ADD VALUE IF NOT EXISTS 'betha_certificate';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE exeq_core.secret_kind ADD VALUE IF NOT EXISTS 'betha_certificate_password';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS exeq_core.municipal_nfse_routing (
  ibge_code VARCHAR(7) PRIMARY KEY,
  provider_kind exeq_core.nfse_provider_kind NOT NULL DEFAULT 'focus_nacional',
  wsdl_url TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE exeq_core.nf_issue
  ADD COLUMN IF NOT EXISTS nfse_provider_kind exeq_core.nfse_provider_kind;

-- Piloto: demais municípios Focus Nacional; Atibaia Betha quando habilitado via seed/app
INSERT INTO exeq_core.municipal_nfse_routing (ibge_code, provider_kind, notes)
VALUES
  ('3504107', 'focus_nacional', 'Atibaia — alternar para betha via UPDATE quando certificado CNC OK'),
  ('3507605', 'focus_nacional', 'Bragança Paulista'),
  ('3528502', 'focus_nacional', 'Mairiporã'),
  ('3547809', 'focus_nacional', 'Santo André')
ON CONFLICT (ibge_code) DO NOTHING;

GRANT SELECT ON exeq_core.municipal_nfse_routing TO exeq_app;
GRANT SELECT, INSERT, UPDATE ON exeq_core.municipal_nfse_routing TO exeq;
