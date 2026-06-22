import type { ChannelDraft } from "@exeq/shared";
import {
  applyTomadorCityToAddress,
  looksLikeFiscalServiceCode,
  mergeChannelDraftPatch,
  normalizeIbge,
  normalizeServiceCode,
  onlyDigits,
  parseAmountCentsFromLabel,
  parseCompetenceIsoFromLabel,
} from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { createCustomer, DuplicateDocumentError, getCustomer, updateCustomer } from "../master-data/master-data.service.js";
import { resolveMunicipioIbgeFromDb } from "./ibge-lookup.service.js";
import { resolveServiceFromHint } from "./service-catalog-search.service.js";

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

function promoteInvalidServiceCodeToHint(next: ChannelDraft): void {
  if (!next.service_code || looksLikeFiscalServiceCode(next.service_code)) return;
  if (!next.service_hint) next.service_hint = next.service_code.slice(0, 255);
  delete next.service_code;
}

function mergeTomadorAddressPreferInbound(
  inbound: ChannelDraft["tomador_address"] | undefined,
  fromCustomer:
    | {
        street?: string;
        number?: string;
        complement?: string;
        district?: string;
        zip_code?: string;
        ibge_code?: string;
        uf?: string;
      }
    | undefined,
): ChannelDraft["tomador_address"] | undefined {
  const merged = { ...(inbound ?? {}) };

  const fill = <K extends keyof NonNullable<ChannelDraft["tomador_address"]>>(
    key: K,
    value: NonNullable<ChannelDraft["tomador_address"]>[K] | undefined,
  ) => {
    const current = merged[key];
    if (typeof current === "string" && current.trim()) return;
    if (value === undefined || value === null) return;
    if (typeof value === "string" && !value.trim()) return;
    merged[key] = value;
  };

  if (fromCustomer) {
    fill("street", fromCustomer.street);
    fill("number", fromCustomer.number);
    fill("complement", fromCustomer.complement);
    fill("district", fromCustomer.district);
    fill("zip_code", fromCustomer.zip_code?.replace(/\D/g, ""));
    fill("ibge_code", fromCustomer.ibge_code);
    fill("state", fromCustomer.uf?.toUpperCase());
  }

  return Object.values(merged).some((v) => typeof v === "string" && v.trim()) ? merged : undefined;
}

async function resolveTomadorCityIbge(
  db: Sql,
  draft: ChannelDraft,
): Promise<ChannelDraft["tomador_address"] | undefined> {
  const addr = draft.tomador_address;
  if (!addr) return undefined;
  if (normalizeIbge(addr.ibge_code)) return addr;

  const cityHint = addr.city_name?.trim();
  if (!cityHint) return addr;

  const ibge = await resolveMunicipioIbgeFromDb(db, cityHint);
  if (!ibge) return addr;

  return { ...addr, ibge_code: ibge, city_name: undefined };
}

/** Resolve tomador/serviço a partir dos campos V11A no draft (lookup ou create tomador). */
export async function resolveChannelDraftIds(
  db: Sql,
  tenantId: string,
  draft: ChannelDraft,
): Promise<ChannelDraft> {
  const next: ChannelDraft = { ...draft };

  promoteInvalidServiceCodeToHint(next);

  if (!next.tomador_document) {
    delete next.customer_id;
  }

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
      const customer = await getCustomer(db, tenantId, customerId);
      if (customer.address) {
        next.tomador_address = mergeTomadorAddressPreferInbound(next.tomador_address, customer.address);
      }
      if (next.tomador_address && hasTomadorAddressFields(next.tomador_address)) {
        await updateCustomer(db, tenantId, customerId, {
          name: next.tomador_name,
          email: next.tomador_email?.includes("@") ? next.tomador_email : undefined,
          address: {
            street: next.tomador_address.street,
            number: next.tomador_address.number,
            complement: next.tomador_address.complement,
            district: next.tomador_address.district,
            zip_code: next.tomador_address.zip_code?.replace(/\D/g, ""),
            ibge_code: next.tomador_address.ibge_code,
            uf: next.tomador_address.state,
          },
        });
      }
      await getCustomer(db, tenantId, customerId);
    }
  }

  if (!next.service_id && next.service_code) {
    const serviceId = await findServiceIdByCode(db, tenantId, next.service_code);
    if (serviceId) {
      next.service_id = serviceId;
    } else {
      // Código fiscal válido mas ausente no catálogo — não bloquear resolução por hint.
      delete next.service_code;
    }
  }

  if (!next.ibge_code && next.city_hint) {
    const ibge = await resolveMunicipioIbgeFromDb(db, next.city_hint);
    if (ibge) next.ibge_code = ibge;
  }

  if (next.tomador_address) {
    next.tomador_address = (await resolveTomadorCityIbge(db, next)) ?? next.tomador_address;
  }

  if (!next.service_id && next.service_hint) {
    const resolved = await resolveServiceFromHint(db, tenantId, next.service_hint);
    if (resolved.service_id) {
      next.service_id = resolved.service_id;
      if (resolved.service_code) next.service_code = resolved.service_code;
      if (next.conversation_flags?.service_ambiguous_options) {
        next.conversation_flags = {
          ...next.conversation_flags,
          service_ambiguous_options: undefined,
        };
      }
    } else if (resolved.ambiguous_matches?.length) {
      next.conversation_flags = {
        ...next.conversation_flags,
        service_ambiguous_options: resolved.ambiguous_matches.map((m) => ({
          service_code: m.service_code,
          description: m.description,
        })),
      };
    }
  }

  return next;
}

function hasTomadorAddressFields(addr: NonNullable<ChannelDraft["tomador_address"]>): boolean {
  return Boolean(
    addr.street?.trim() &&
      addr.number?.trim() &&
      addr.district?.trim() &&
      addr.zip_code?.replace(/\D/g, "").length === 8 &&
      addr.ibge_code?.length === 7,
  );
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
    const addr: NonNullable<ChannelDraft["tomador_address"]> = {};
    if (labeled.tomador_street) addr.street = labeled.tomador_street;
    if (labeled.tomador_number) addr.number = labeled.tomador_number;
    if (labeled.tomador_complement) addr.complement = labeled.tomador_complement;
    if (labeled.tomador_district) addr.district = labeled.tomador_district;
    if (labeled.tomador_zip) addr.zip_code = onlyDigits(labeled.tomador_zip);
    if (labeled.tomador_state) addr.state = labeled.tomador_state.toUpperCase();
    if (labeled.tomador_city_ibge) applyTomadorCityToAddress(addr, labeled.tomador_city_ibge);
    next.tomador_address = mergeChannelDraftPatch(next, { tomador_address: addr }).tomador_address;
  }

  return next;
}
