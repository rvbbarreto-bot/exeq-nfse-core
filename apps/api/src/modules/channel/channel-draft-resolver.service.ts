import type { ChannelDraft } from "@exeq/shared";
import {
  normalizeIbge,
  normalizeServiceCode,
  onlyDigits,
  parseAmountCentsFromLabel,
  parseCompetenceIsoFromLabel,
} from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { createCustomer, DuplicateDocumentError, getCustomer } from "../master-data/master-data.service.js";

export async function findCustomerIdByDocument(
  db: Sql,
  tenantId: string,
  document: string,
): Promise<string | null> {
  const doc = onlyDigits(document);
  const [row] = await db<{ id: string }[]>`
    SELECT id FROM exeq_core.customers
    WHERE tenant_id = ${tenantId}::uuid AND document = ${doc}
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function findServiceIdByCode(
  db: Sql,
  tenantId: string,
  serviceCode: string,
): Promise<string | null> {
  const normalized = normalizeServiceCode(serviceCode);
  if (!normalized) return null;

  const candidates = [
    normalized,
    normalized.replace(/\./g, ""),
    normalized.replace(/\./g, "").replace(/^0+/, ""),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const code of candidates) {
    const [row] = await db<{ id: string }[]>`
      SELECT id FROM exeq_core.service_catalog_items
      WHERE tenant_id = ${tenantId}::uuid
        AND (service_code = ${code} OR REPLACE(service_code, '.', '') = ${code.replace(/\./g, "")})
      LIMIT 1
    `;
    if (row?.id) return row.id;
  }

  return null;
}

/** Resolve tomador/serviço a partir dos campos V11A no draft (lookup ou create tomador). */
export async function resolveChannelDraftIds(
  db: Sql,
  tenantId: string,
  draft: ChannelDraft,
): Promise<ChannelDraft> {
  const next: ChannelDraft = { ...draft };

  if (!next.customer_id && next.tomador_document && next.tomador_name) {
    const doc = onlyDigits(next.tomador_document);
    let customerId = await findCustomerIdByDocument(db, tenantId, doc);

    if (!customerId) {
      try {
        const created = await createCustomer(db, tenantId, {
          document: doc,
          name: next.tomador_name,
          email: next.tomador_email?.includes("@") ? next.tomador_email : undefined,
          address: {
            street: next.tomador_address?.street,
            number: next.tomador_address?.number,
            complement: next.tomador_address?.complement,
            district: next.tomador_address?.district,
            zip_code: next.tomador_address?.zip_code,
            ibge_code: next.tomador_address?.ibge_code,
            uf: next.tomador_address?.state,
          },
        });
        customerId = created.id;
      } catch (err) {
        if (err instanceof DuplicateDocumentError) {
          customerId = await findCustomerIdByDocument(db, tenantId, doc);
        } else {
          throw err;
        }
      }
    }

    if (customerId) {
      next.customer_id = customerId;
      await getCustomer(db, tenantId, customerId);
    }
  }

  if (!next.service_id && next.service_code) {
    const serviceId = await findServiceIdByCode(db, tenantId, next.service_code);
    if (serviceId) next.service_id = serviceId;
  }

  return next;
}

/** Aplica campos rotulados V11A ao draft canônico de emissão. */
export function applyLabeledFieldsToDraft(
  draft: ChannelDraft,
  labeled: {
    tomador_name?: string;
    tomador_document?: string;
    amount_label?: string;
    description?: string;
    competence_label?: string;
    service_code?: string;
    ibge_code?: string;
    tomador_email?: string;
    tomador_street?: string;
    tomador_number?: string;
    tomador_complement?: string;
    tomador_district?: string;
    tomador_city_ibge?: string;
    tomador_state?: string;
    tomador_zip?: string;
  },
): ChannelDraft {
  const next: ChannelDraft = { ...draft };

  if (labeled.tomador_name) next.tomador_name = labeled.tomador_name;
  if (labeled.tomador_document) next.tomador_document = labeled.tomador_document;

  const amount = parseAmountCentsFromLabel(labeled.amount_label);
  if (amount != null && amount > 0) next.amount_cents = amount;

  if (labeled.description) next.description = labeled.description.slice(0, 2000);

  const competence = parseCompetenceIsoFromLabel(labeled.competence_label);
  if (competence) next.competence_date = competence;

  const ibge = normalizeIbge(labeled.ibge_code);
  if (ibge) next.ibge_code = ibge;

  const serviceCode = normalizeServiceCode(labeled.service_code);
  if (serviceCode) next.service_code = serviceCode;

  if (labeled.tomador_email) next.tomador_email = labeled.tomador_email;

  const hasAddress =
    labeled.tomador_street ||
    labeled.tomador_number ||
    labeled.tomador_complement ||
    labeled.tomador_district ||
    labeled.tomador_zip ||
    labeled.tomador_city_ibge ||
    labeled.tomador_state;

  if (hasAddress) {
    next.tomador_address = {
      street: labeled.tomador_street,
      number: labeled.tomador_number,
      complement: labeled.tomador_complement,
      district: labeled.tomador_district,
      zip_code: onlyDigits(labeled.tomador_zip),
      ibge_code: normalizeIbge(labeled.tomador_city_ibge),
      state: labeled.tomador_state?.toUpperCase(),
    };
  }

  return next;
}
