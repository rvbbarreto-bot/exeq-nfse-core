#!/usr/bin/env node
/**
 * Verifica focus_token no vault (perfil produção).
 * Uso interno: node --import tsx scripts/check-focus-prod-token.mjs
 * Saída JSON na última linha: { ok, message? }
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const importApi = (p) =>
  import(pathToFileURL(path.join(root, "apps/api/src", p)).href);

const tenantSlug = process.env.HOMOLOG_TENANT_SLUG ?? "piloto-sp";

try {
  const { withTenant, closeDb } = await importApi("db/client.ts");
  const { resolveTenantIdBySlug } = await importApi("modules/platform/tenant-resolver.ts");
  const { getTenantSecret } = await importApi("modules/platform/secret-vault.service.ts");

  const tenantId = await resolveTenantIdBySlug(tenantSlug);
  const token = await withTenant(tenantId, (tx) =>
    getTenantSecret(tx, tenantId, "focus_token"),
  );
  await closeDb();

  if (!token || token === "sandbox-focus-token-placeholder") {
    console.log(
      JSON.stringify({
        ok: false,
        message:
          'focus_token ausente ou placeholder — emissão real falhará com HTTP 401. PO: $env:FOCUS_TOKEN="token-producao"; npm run prod:focus:save-token',
      }),
    );
    process.exit(0);
  }

  console.log(JSON.stringify({ ok: true, message: `focus_token vault (${token.length} chars)` }));
} catch (err) {
  console.log(
    JSON.stringify({
      ok: false,
      message: `Não foi possível ler focus_token: ${err.message}`,
    }),
  );
  process.exit(1);
}
