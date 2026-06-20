#!/usr/bin/env node
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env" });
const issueId = process.argv[2] ?? "af24c03d-6ba5-4313-98f7-f450ecad9c4e";
const sql = postgres(process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL);
const [issue] = await sql`
  SELECT internal_payload FROM exeq_core.nf_issue WHERE id = ${issueId}::uuid
`;
const [rule] = await sql`
  SELECT focus_field_overrides FROM exeq_core.municipal_tax_rules WHERE ibge_code='3504107' LIMIT 1
`;
const logs = await sql`
  SELECT action, metadata FROM exeq_core.audit_log
  WHERE entity_id = ${issueId}::uuid ORDER BY created_at
`;
console.log("rule overrides:", rule?.focus_field_overrides);
console.log("issue overrides:", issue?.internal_payload?.tributacao?.focus_field_overrides);
const { mapExeqNfseV1ToFocusNfsen } = await import("../apps/api/src/modules/integration/focus/focus-nfsen.adapter.ts");
console.log("mapped focus payload:", JSON.stringify(mapExeqNfseV1ToFocusNfsen(issue.internal_payload)));
console.log("audit:", JSON.stringify(logs, null, 2));
await sql.end();
