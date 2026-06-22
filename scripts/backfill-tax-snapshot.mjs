#!/usr/bin/env node
/**
 * RFC-0020 Fase 2 — backfill tax_snapshot para emissões históricas sem snapshot.
 *
 * Uso:
 *   npm run backfill:snapshots
 *   npm run backfill:snapshots -- --days=90 --tenant=piloto-sp
 *   npm run backfill:snapshots -- --dry-run
 */
import { config } from "dotenv";

config({ path: ".env" });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.find((a) => a.startsWith("--days="));
const tenantArg = args.find((a) => a.startsWith("--tenant="));
const limitArg = args.find((a) => a.startsWith("--limit="));

const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : 90;
const tenantSlug = tenantArg?.split("=")[1] ?? "piloto-sp";
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 5000;

const { runBackfillTaxSnapshots } = await import(
  "../apps/api/src/modules/fiscal/backfill-tax-snapshot.service.ts"
);

const summary = await runBackfillTaxSnapshots({ days, tenantSlug, limit, dryRun });

const { closeDb } = await import("../apps/api/src/db/client.ts");
await closeDb();

console.log("\n=== Backfill tax_snapshot ===");
console.log(`Tenant:     ${summary.tenant_slug ?? "all"}`);
console.log(`Janela:     ${summary.days} dias`);
console.log(`Candidatos: ${summary.candidates}`);
console.log(`Criados:    ${summary.created}`);
console.log(`Ignorados:  ${summary.skipped}`);
console.log(`Erros:      ${summary.errors}`);
if (summary.dry_run) console.log("(dry-run — nenhum INSERT)");

process.exit(summary.errors > 0 ? 1 : 0);
