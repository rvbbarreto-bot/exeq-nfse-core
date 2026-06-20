import type { ChannelDraft } from "@exeq/shared";
import type { Sql } from "../../db/client.js";

export type ChannelContactRow = {
  id: string;
  phone_e164: string;
  display_name: string | null;
  last_successful_draft: ChannelDraft | null;
  last_nf_issue_id: string | null;
  total_emissions: number;
};

export async function upsertChannelContact(
  db: Sql,
  tenantId: string,
  input: { phone_e164: string; display_name?: string },
): Promise<ChannelContactRow> {
  const name = input.display_name?.trim() || null;

  const [row] = await db<ChannelContactRow[]>`
    INSERT INTO exeq_core.channel_contact (
      tenant_id, phone_e164, display_name, last_interaction_at
    ) VALUES (
      ${tenantId}::uuid, ${input.phone_e164}, ${name}, now()
    )
    ON CONFLICT (tenant_id, phone_e164)
    DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, exeq_core.channel_contact.display_name),
      last_interaction_at = now(),
      updated_at = now()
    RETURNING id, phone_e164, display_name, last_successful_draft,
              last_nf_issue_id, total_emissions
  `;
  return row!;
}

export async function getChannelContact(
  db: Sql,
  tenantId: string,
  phoneE164: string,
): Promise<ChannelContactRow | null> {
  const [row] = await db<ChannelContactRow[]>`
    SELECT id, phone_e164, display_name, last_successful_draft,
           last_nf_issue_id, total_emissions
    FROM exeq_core.channel_contact
    WHERE tenant_id = ${tenantId}::uuid AND phone_e164 = ${phoneE164}
  `;
  return row ?? null;
}

export async function recordChannelMessage(
  db: Sql,
  tenantId: string,
  input: {
    contact_id?: string;
    session_id?: string;
    direction: "inbound" | "outbound";
    message_id?: string;
    message_body: string;
  },
): Promise<void> {
  await db`
    INSERT INTO exeq_core.channel_message_log (
      tenant_id, contact_id, session_id, direction, message_id, message_body
    ) VALUES (
      ${tenantId}::uuid,
      ${input.contact_id ?? null}::uuid,
      ${input.session_id ?? null}::uuid,
      ${input.direction},
      ${input.message_id ?? null},
      ${input.message_body}
    )
  `;
}

/** M0.1 — persiste inbound antes do debounce; dedup por (tenant, message_id). */
export async function recordInboundBeforeDebounce(
  db: Sql,
  tenantId: string,
  input: {
    contact_id: string;
    message_id: string;
    message_body: string;
  },
): Promise<"inserted" | "duplicate"> {
  const [existing] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.channel_message_log
    WHERE tenant_id = ${tenantId}::uuid
      AND message_id = ${input.message_id}
      AND direction = 'inbound'
    LIMIT 1
  `;
  if (existing) return "duplicate";

  try {
    await db`
      INSERT INTO exeq_core.channel_message_log (
        tenant_id, contact_id, session_id, direction, message_id, message_body
      ) VALUES (
        ${tenantId}::uuid,
        ${input.contact_id}::uuid,
        NULL,
        'inbound',
        ${input.message_id},
        ${input.message_body}
      )
    `;
    return "inserted";
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") return "duplicate";
    throw err;
  }
}

export async function saveSuccessfulEmissionToContact(
  db: Sql,
  tenantId: string,
  phoneE164: string,
  draft: ChannelDraft,
  issueId: string,
): Promise<void> {
  const snapshot = { ...draft };
  delete snapshot.conversation_flags;

  await db`
    UPDATE exeq_core.channel_contact SET
      last_successful_draft = ${db.json(snapshot)},
      last_nf_issue_id = ${issueId}::uuid,
      total_emissions = total_emissions + 1,
      last_interaction_at = now(),
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND phone_e164 = ${phoneE164}
  `;
}

/** Draft reutilizável — mantém tomador/serviço, atualiza competência para hoje (BR). */
export function cloneRepeatableDraft(source: ChannelDraft): Partial<ChannelDraft> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";

  return {
    provider_id: source.provider_id,
    customer_id: source.customer_id,
    service_id: source.service_id,
    tomador_name: source.tomador_name,
    tomador_document: source.tomador_document,
    tomador_email: source.tomador_email,
    tomador_address: source.tomador_address,
    service_code: source.service_code,
    ibge_code: source.ibge_code,
    description: source.description,
    amount_cents: source.amount_cents,
    competence_date: `${y}-${m}-${d}`,
    conversation_flags: { repeat_offer_pending: false },
  };
}
