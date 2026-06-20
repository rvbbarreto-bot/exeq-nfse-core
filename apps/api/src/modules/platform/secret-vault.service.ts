import type { Sql } from "../../db/client.js";
import { decryptSecret } from "./secret-vault.js";

export type SecretKind =
  | "focus_token"
  | "gateway_key"
  | "webhook_secret"
  | "channel_token"
  | "betha_certificate"
  | "betha_certificate_password";

export async function getTenantSecret(
  db: Sql,
  tenantId: string,
  kind: SecretKind,
): Promise<string | null> {
  const [row] = await db<{ ciphertext: Buffer }[]>`
    SELECT ciphertext FROM exeq_core.secret_vault
    WHERE tenant_id = ${tenantId}::uuid AND kind = ${kind}::exeq_core.secret_kind
    LIMIT 1
  `;
  if (!row) return null;
  return decryptSecret(row.ciphertext);
}
