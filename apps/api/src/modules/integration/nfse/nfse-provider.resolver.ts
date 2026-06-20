import type { NfseProviderKind } from "@exeq/shared";
import type { Sql } from "../../../db/client.js";
import { env } from "../../../config/env.js";
import { createMunicipalRulesService } from "../../fiscal/municipal-rules/municipal-rules.service.js";

type RoutingRow = {
  provider_kind: NfseProviderKind;
  wsdl_url: string | null;
};

const DEFAULT_KIND: NfseProviderKind = "focus_nacional";

/** Aplica política PO (focus_only descarta roteamento Betha). */
export function applyNfseRoutingPolicy(kind: NfseProviderKind): NfseProviderKind {
  if (env.NFSE_ROUTING_POLICY === "focus_only" && kind === "betha") {
    return DEFAULT_KIND;
  }
  return kind;
}

export function resolveNfseProviderKindFromConfig(
  _ibgeCode: string,
  _tableKind?: NfseProviderKind | null,
): NfseProviderKind {
  return applyNfseRoutingPolicy(_tableKind ?? DEFAULT_KIND);
}

/**
 * Resolve provedor NFS-e por IBGE.
 * Fonte primária: municipal_emission_rules (onboarding).
 * Fallback: municipal_nfse_routing (legado).
 */
export async function resolveNfseProviderKind(
  db: Sql,
  ibgeCode: string,
): Promise<NfseProviderKind> {
  const emissionRules = await createMunicipalRulesService(db).resolveByIbge(ibgeCode);
  if (emissionRules.municipio_nome !== "Desconhecido") {
    return applyNfseRoutingPolicy(emissionRules.provider_kind);
  }

  const [row] = await db<RoutingRow[]>`
    SELECT provider_kind::text AS provider_kind, wsdl_url
    FROM exeq_core.municipal_nfse_routing
    WHERE ibge_code = ${ibgeCode}
    LIMIT 1
  `;

  return resolveNfseProviderKindFromConfig(
    ibgeCode,
    (row?.provider_kind as NfseProviderKind) ?? null,
  );
}

export async function resolveBethaWsdlUrl(db: Sql, ibgeCode: string): Promise<string | undefined> {
  const [row] = await db<{ wsdl_url: string | null }[]>`
    SELECT wsdl_url FROM exeq_core.municipal_nfse_routing
    WHERE ibge_code = ${ibgeCode}
    LIMIT 1
  `;
  return row?.wsdl_url ?? env.BETHA_WSDL_URL ?? undefined;
}
