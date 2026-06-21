#!/usr/bin/env node
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });
config({ path: path.join(root, ".env.channel"), override: true });

const { getDb, withTenant, closeDb } = await import("../apps/api/src/db/client.js");
const dbPool = getDb();
const { findServicesByHint, resolveServiceFromHint } = await import(
  "../apps/api/src/modules/channel/service-catalog-search.service.js"
);
const { parseConsolidatedChannelMessages } = await import("@exeq/shared");
const { resolveChannelDraftIds } = await import(
  "../apps/api/src/modules/channel/channel-draft-resolver.service.js"
);

const [tenant] = await dbPool`SELECT id, slug FROM exeq_core.tenants WHERE slug = 'piloto-sp' LIMIT 1`;
if (!tenant) {
  console.error("tenant piloto-sp not found");
  process.exit(1);
}

console.log("tenant:", tenant.id);

await withTenant(tenant.id, async (db) => {
  const catalog = await db`
    SELECT id, service_code, description, is_active
    FROM exeq_core.service_catalog_items
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY service_code
    LIMIT 20
  `;
  console.log("catalog items:", catalog.length);
  for (const row of catalog) {
    console.log(`  ${row.service_code} | active=${row.is_active} | ${row.description.slice(0, 60)}`);
  }

  for (const hint of ["desenvolvimento de software", "serviço desenvolvimento de software"]) {
    const matches = await findServicesByHint(db, tenant.id, hint, 5);
    const resolved = await resolveServiceFromHint(db, tenant.id, hint);
    console.log("\nhint:", hint);
    console.log("  matches:", matches.length, matches.map((m) => m.service_code));
    console.log("  resolved:", resolved);
  }

  const batch = [
    "ola boa tarde",
    "gostaia de uma nova nota",
    "poede emitir",
    "valor de 1.234,00",
    "cidade Atibaia",
    "serviço desenvolvimento de software",
  ].join("\n");
  const parsed = parseConsolidatedChannelMessages(batch);
  console.log("\nparsed mergedPatch:", parsed.mergedPatch);

  const draft = {
    provider_id: "00000000-0000-0000-0000-000000000001",
    ...parsed.mergedPatch,
    competence_date: "2026-06-20",
    tomador_name: "Cliente Teste",
    tomador_document: "56004031000175",
    service_code: "1.04",
  };
  const resolvedDraft = await resolveChannelDraftIds(db, tenant.id, draft);
  console.log("\nresolved draft (code 1.04 stale + hint):");
  console.log("  service_id:", resolvedDraft.service_id);
  console.log("  service_code:", resolvedDraft.service_code);
  console.log("  service_hint:", resolvedDraft.service_hint);

  const sessions = await db`
    SELECT id, phone_e164, status, draft_payload, updated_at
    FROM exeq_core.channel_session
    WHERE tenant_id = ${tenant.id}::uuid
      AND status IN ('collecting', 'ready_to_confirm')
    ORDER BY updated_at DESC
    LIMIT 3
  `;
  console.log("\nactive sessions:", sessions.length);
  for (const s of sessions) {
    const d = s.draft_payload ?? {};
    console.log(`  ${s.phone_e164} | missing service_id=${!d.service_id} hint=${d.service_hint ?? "-"} code=${d.service_code ?? "-"}`);
  }
});

await closeDb();
