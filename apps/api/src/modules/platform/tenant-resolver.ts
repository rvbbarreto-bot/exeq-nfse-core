import { getMigrationDb } from "../../db/client.js";

export class TenantNotFoundError extends Error {
  constructor() {
    super("TENANT_NOT_FOUND");
    this.name = "TenantNotFoundError";
  }
}

export async function resolveTenantIdBySlug(slug: string): Promise<string> {
  const db = getMigrationDb();
  const [row] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.tenants WHERE slug = ${slug} AND status = 'active' LIMIT 1
  `;
  if (!row) throw new TenantNotFoundError();
  return row.id;
}
