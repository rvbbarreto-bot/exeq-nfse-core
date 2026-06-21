-- FASE 1 — catálogo IBGE (expansão além do hardcode pilot-municipios.ts)

CREATE TABLE IF NOT EXISTS exeq_core.ibge_municipios (
  ibge_code CHAR(7) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  uf CHAR(2) NOT NULL,
  nome_normalizado VARCHAR(120) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ibge_municipios_nome_norm
  ON exeq_core.ibge_municipios (nome_normalizado);

GRANT SELECT ON exeq_core.ibge_municipios TO exeq_app;

-- Seed inicial: municípios piloto + amostra SP (import completo: npm run seed:ibge-municipios)
INSERT INTO exeq_core.ibge_municipios (ibge_code, nome, uf, nome_normalizado) VALUES
  ('3504107', 'Atibaia', 'SP', 'atibaia'),
  ('3507605', 'Bragança Paulista', 'SP', 'braganca paulista'),
  ('3528502', 'Mairiporã', 'SP', 'mairipora'),
  ('3547809', 'Santo André', 'SP', 'santo andre'),
  ('3505708', 'Barueri', 'SP', 'barueri'),
  ('3513801', 'Diadema', 'SP', 'diadema'),
  ('3550308', 'São Paulo', 'SP', 'sao paulo'),
  ('3509502', 'Campinas', 'SP', 'campinas'),
  ('3518800', 'Guarulhos', 'SP', 'guarulhos'),
  ('3548708', 'Sorocaba', 'SP', 'sorocaba'),
  ('3543402', 'Ribeirão Preto', 'SP', 'ribeirao preto'),
  ('3549904', 'São José dos Campos', 'SP', 'sao jose dos campos'),
  ('3515004', 'Embu das Artes', 'SP', 'embu das artes'),
  ('3525904', 'Jundiaí', 'SP', 'jundiai'),
  ('3534401', 'Osasco', 'SP', 'osasco')
ON CONFLICT (ibge_code) DO NOTHING;
