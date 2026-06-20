-- Regras de emissão municipal (CNC / ADN / payload) — configuração global por IBGE
CREATE TABLE IF NOT EXISTS exeq_core.municipal_emission_rules (
  ibge_code CHAR(7) PRIMARY KEY,
  municipio_nome TEXT NOT NULL,
  uf CHAR(2) NOT NULL,
  enviar_inscricao_municipal_prestador BOOLEAN NOT NULL DEFAULT true,
  usa_nfse_nacional BOOLEAN NOT NULL DEFAULT true,
  provider_kind exeq_core.nfse_provider_kind NOT NULL DEFAULT 'focus_nacional',
  observacao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE exeq_core.municipal_emission_rules IS
  'Regras de payload e convênio por município (E0120 CNC, provedor fiscal).';

COMMENT ON COLUMN exeq_core.municipal_emission_rules.enviar_inscricao_municipal_prestador IS
  'false quando CNC NFS-e do município não aceita IM no DPS nacional (ex.: E0120 Atibaia).';

INSERT INTO exeq_core.municipal_emission_rules (
  ibge_code, municipio_nome, uf,
  enviar_inscricao_municipal_prestador, usa_nfse_nacional, provider_kind, observacao
) VALUES
  (
    '3504107', 'Atibaia', 'SP',
    false, true, 'focus_nacional',
    'CNC NFS-e: não informar inscricao_municipal_prestador (E0120). Provedor municipal Betha; emissão ADN via Focus.'
  ),
  ('3507605', 'Bragança Paulista', 'SP', true, true, 'focus_nacional', NULL),
  ('3528502', 'Mairiporã', 'SP', true, true, 'focus_nacional', NULL),
  ('3547809', 'Santo André', 'SP', true, true, 'focus_nacional', NULL)
ON CONFLICT (ibge_code) DO UPDATE SET
  enviar_inscricao_municipal_prestador = EXCLUDED.enviar_inscricao_municipal_prestador,
  usa_nfse_nacional = EXCLUDED.usa_nfse_nacional,
  provider_kind = EXCLUDED.provider_kind,
  observacao = EXCLUDED.observacao,
  updated_at = now();

GRANT SELECT ON exeq_core.municipal_emission_rules TO exeq_app;
GRANT SELECT, INSERT, UPDATE ON exeq_core.municipal_emission_rules TO exeq;
