#!/usr/bin/env node
/**
 * Rotaciona secret no vault de um tenant.
 * Requer MASTER_KEY e DATABASE_URL (migration role) no ambiente.
 *
 * Uso:
 *   node scripts/rotate-tenant-secret.mjs --tenant-slug piloto-sp --kind focus_token --value "novo-token"
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const tenantSlug = getArg("--tenant-slug");
const kind = getArg("--kind");
const value = getArg("--value");

const VALID_KINDS = [
  "focus_token",
  "gateway_key",
  "webhook_secret",
  "channel_token",
  "betha_certificate",
  "betha_certificate_password",
];

if (!tenantSlug || !kind || !value) {
  console.error(
    "Usage: node scripts/rotate-tenant-secret.mjs --tenant-slug <slug> --kind <kind> --value <secret>",
  );
  process.exit(1);
}

if (!VALID_KINDS.includes(kind)) {
  console.error(`Invalid kind. Use one of: ${VALID_KINDS.join(", ")}`);
  process.exit(1);
}

const masterKey = process.env.MASTER_KEY;
const dbUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!masterKey || masterKey.length !== 64) {
  console.error("MASTER_KEY must be 64 hex chars in environment");
  process.exit(1);
}
if (!dbUrl) {
  console.error("DATABASE_URL or MIGRATION_DATABASE_URL required");
  process.exit(1);
}

function encryptSecret(plaintext) {
  const key = Buffer.from(masterKey, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

const sql = postgres(dbUrl);

const [tenant] = await sql`
  SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1
`;
if (!tenant) {
  console.error(`Tenant not found: ${tenantSlug}`);
  process.exit(1);
}

const ciphertext = encryptSecret(value);
await sql`
  INSERT INTO exeq_core.secret_vault (tenant_id, kind, ciphertext)
  VALUES (${tenant.id}, ${kind}::exeq_core.secret_kind, ${ciphertext})
  ON CONFLICT (tenant_id, kind) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()
`;

console.log(`Rotated ${kind} for tenant ${tenantSlug}`);
await sql.end();
