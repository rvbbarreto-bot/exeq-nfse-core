import type { Sql } from "../../db/client.js";

export type ChannelEmissionDefaults = {
  provider_id: string;
};

/** Defaults mínimos: apenas prestador. Tomador/serviço vêm do WhatsApp (V11A). */
export async function resolveChannelEmissionDefaults(
  db: Sql,
  tenantId: string,
): Promise<Pick<ChannelEmissionDefaults, "provider_id">> {
  const providerCnpj = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "");

  const [provider] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.providers
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY CASE WHEN document = ${providerCnpj} THEN 0 ELSE 1 END, created_at
    LIMIT 1
  `;

  if (!provider?.id) {
    throw new Error("CHANNEL_MASTER_DATA_MISSING");
  }

  return { provider_id: provider.id };
}
