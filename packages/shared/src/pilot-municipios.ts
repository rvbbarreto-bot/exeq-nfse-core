export type PilotMunicipio = {
  ibge_code: string;
  label: string;
  uf: "SP";
  /** Homologação H3 concluída */
  homologado_h3: boolean;
};

/** Escopo operacional PO — 4 municípios (CR 25/05/2026, Sprint 15). */
export const PILOT_MUNICIPIOS: PilotMunicipio[] = [
  { ibge_code: "3504107", label: "Atibaia", uf: "SP", homologado_h3: true },
  { ibge_code: "3507605", label: "Bragança Paulista", uf: "SP", homologado_h3: true },
  { ibge_code: "3528502", label: "Mairiporã", uf: "SP", homologado_h3: true },
  { ibge_code: "3547809", label: "Santo André", uf: "SP", homologado_h3: true },
];

/** Alias histórico — conjunto operacional vigente. */
export const PILOT_MUNICIPIOS_BASE = PILOT_MUNICIPIOS;

/** 5º município ativado (Sprint 15). */
export const PILOT_MUNICIPIO_SANTO_ANDRE = PILOT_MUNICIPIOS[3]!;

/**
 * Barueri — fora do escopo operacional PO; seed/regressão (`test:fiscal-p0-extended`).
 */
export const PILOT_MUNICIPIO_BARUERI: PilotMunicipio = {
  ibge_code: "3505708",
  label: "Barueri",
  uf: "SP",
  homologado_h3: false,
};

/** Candidato remanescente (sem CR). */
export const PILOT_MUNICIPIO_5TH_CANDIDATES: PilotMunicipio[] = [
  { ibge_code: "3513801", label: "Diadema", uf: "SP", homologado_h3: false },
];

export const PILOT_IBGE_CODES = PILOT_MUNICIPIOS.map((m) => m.ibge_code);

export const PILOT_IBGE_CODES_EXTENDED = [...PILOT_IBGE_CODES, PILOT_MUNICIPIO_BARUERI.ibge_code];

export function findPilotMunicipio(ibgeCode: string): PilotMunicipio | undefined {
  return (
    PILOT_MUNICIPIOS.find((m) => m.ibge_code === ibgeCode) ??
    PILOT_MUNICIPIO_5TH_CANDIDATES.find((m) => m.ibge_code === ibgeCode) ??
    (ibgeCode === PILOT_MUNICIPIO_BARUERI.ibge_code ? PILOT_MUNICIPIO_BARUERI : undefined)
  );
}

export function isOperationalPilotIbge(ibgeCode: string): boolean {
  return PILOT_IBGE_CODES.includes(ibgeCode);
}

function normalizeCityToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MUNICIPIO_ALIASES: Record<string, string> = {
  atibaia: "3504107",
  tibaya: "3504107",
  braganca: "3507605",
  "braganca paulista": "3507605",
  mairipora: "3528502",
  "santo andre": "3547809",
  barueri: "3505708",
};

/** Resolve IBGE a partir do nome da cidade no texto (piloto SP). Preferir resolveMunicipioIbgeFromDb na API. */
export function resolveMunicipioIbgeFromText(text: string): string | undefined {
  const norm = normalizeCityToken(text);
  if (!norm) return undefined;

  for (const [alias, ibge] of Object.entries(MUNICIPIO_ALIASES)) {
    if (norm.includes(alias)) return ibge;
  }

  for (const m of [...PILOT_MUNICIPIOS, PILOT_MUNICIPIO_BARUERI, ...PILOT_MUNICIPIO_5TH_CANDIDATES]) {
    const city = normalizeCityToken(m.label);
    if (city && norm.includes(city)) return m.ibge_code;
  }

  return undefined;
}

export function municipioLabelFromIbge(ibgeCode: string | undefined): string | undefined {
  if (!ibgeCode) return undefined;
  return findPilotMunicipio(ibgeCode)?.label ?? ibgeCode;
}
