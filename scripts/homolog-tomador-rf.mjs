/**
 * Tomador padrão homolog/prod E2E — CNPJ ativo na Receita Federal.
 * Endereço deve bater com cadastro RF (Focus E0240 valida CEP × município do tomador).
 *
 * CNPJ 11.444.777/0001-61 — Jardinópolis/SP (não Atibaia).
 */
export const DEFAULT_HOMOLOG_TOMADOR_CNPJ = "11444777000161";

/** Par CEP × IBGE coerente na base nacional (evita E0240). */
export const DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS = {
  ibge_code: "3524303",
  street: "Rua Plinio da Silva Reis",
  number: "377",
  district: "Centro",
  zip_code: "14680000",
  state: "SP",
};

export function resolveHomologCustomerAddress(env = process.env) {
  return {
    ibge_code: env.HOMOLOG_CUSTOMER_IBGE ?? DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS.ibge_code,
    street: env.HOMOLOG_CUSTOMER_STREET ?? DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS.street,
    number: env.HOMOLOG_CUSTOMER_NUMBER ?? DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS.number,
    district: env.HOMOLOG_CUSTOMER_DISTRICT ?? DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS.district,
    zip_code: (env.HOMOLOG_CUSTOMER_ZIP ?? DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS.zip_code).replace(
      /\D/g,
      "",
    ),
    state: env.HOMOLOG_CUSTOMER_STATE ?? DEFAULT_HOMOLOG_TOMADOR_RF_ADDRESS.state,
  };
}
