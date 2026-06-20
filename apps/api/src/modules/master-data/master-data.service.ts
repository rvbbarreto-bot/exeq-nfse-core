import type {
  CreateCustomerInput,
  CreateProviderInput,
  CreateServiceCatalogItemInput,
  TaxRegime,
  UpdateCustomerInput,
  UpdateProviderInput,
  UpdateServiceCatalogItemInput,
} from "@exeq/shared";
import { assertValidDocument, stripDocument } from "@exeq/shared";
import type { Sql } from "../../db/client.js";
import { asJsonValue } from "../../lib/json.js";

export class DuplicateDocumentError extends Error {
  constructor() {
    super("DUPLICATE_DOCUMENT");
    this.name = "DuplicateDocumentError";
  }
}

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity}_NOT_FOUND`);
    this.name = "NotFoundError";
  }
}

export async function listProviders(db: Sql, tenantId: string) {
  return db`
    SELECT id, document, legal_name, trade_name, municipal_registration, tax_regime,
           address, is_active, created_at, updated_at
    FROM exeq_core.providers
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY legal_name
  `;
}

export async function createProvider(db: Sql, tenantId: string, input: CreateProviderInput) {
  assertValidDocument(input.document);
  const document = stripDocument(input.document);

  try {
    const [row] = await db`
      INSERT INTO exeq_core.providers (
        tenant_id, document, legal_name, trade_name, municipal_registration, tax_regime, address
      ) VALUES (
        ${tenantId}::uuid, ${document}, ${input.legal_name}, ${input.trade_name ?? null},
        ${input.municipal_registration ?? null}, ${input.tax_regime}::exeq_core.tax_regime,
        ${db.json(asJsonValue(input.address ?? {}))}
      )
      RETURNING id, document, legal_name, trade_name, municipal_registration, tax_regime,
                address, is_active, created_at, updated_at
    `;
    return row;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new DuplicateDocumentError();
    throw err;
  }
}

export async function updateProvider(
  db: Sql,
  tenantId: string,
  id: string,
  input: UpdateProviderInput,
) {
  const current = await getProvider(db, tenantId, id);
  const document = input.document ? stripDocument(input.document) : current.document;
  if (input.document) assertValidDocument(document);

  const [row] = await db`
    UPDATE exeq_core.providers SET
      document = ${document},
      legal_name = ${input.legal_name ?? current.legal_name},
      trade_name = ${input.trade_name !== undefined ? input.trade_name : current.trade_name},
      municipal_registration = ${
        input.municipal_registration !== undefined
          ? input.municipal_registration
          : current.municipal_registration
      },
      tax_regime = ${(input.tax_regime ?? current.tax_regime) as string}::exeq_core.tax_regime,
      address = ${db.json(asJsonValue(input.address ?? current.address ?? {}))},
      is_active = ${input.is_active ?? current.is_active},
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
    RETURNING id, document, legal_name, trade_name, municipal_registration, tax_regime,
              address, is_active, created_at, updated_at
  `;
  return row;
}

type ProviderRow = {
  id: string;
  document: string;
  legal_name: string;
  trade_name: string | null;
  municipal_registration: string | null;
  tax_regime: TaxRegime;
  address: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getProvider(db: Sql, tenantId: string, id: string): Promise<ProviderRow> {
  const [row] = await db<ProviderRow[]>`
    SELECT id, document, legal_name, trade_name, municipal_registration, tax_regime,
           address, is_active, created_at, updated_at
    FROM exeq_core.providers
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
  `;
  if (!row) throw new NotFoundError("PROVIDER");
  return row;
}

export async function listCustomers(db: Sql, tenantId: string) {
  return db`
    SELECT id, document, document_type, name, email, address, is_active, created_at, updated_at
    FROM exeq_core.customers
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY name
  `;
}

export async function createCustomer(db: Sql, tenantId: string, input: CreateCustomerInput) {
  const documentType = assertValidDocument(input.document);
  const document = stripDocument(input.document);

  try {
    const [row] = await db`
      INSERT INTO exeq_core.customers (tenant_id, document, document_type, name, email, address)
      VALUES (
        ${tenantId}::uuid, ${document}, ${documentType}, ${input.name},
        ${input.email ?? null}, ${db.json(input.address ?? {})}
      )
      RETURNING id, document, document_type, name, email, address, is_active, created_at, updated_at
    `;
    return row;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new DuplicateDocumentError();
    throw err;
  }
}

export async function updateCustomer(
  db: Sql,
  tenantId: string,
  id: string,
  input: UpdateCustomerInput,
) {
  const current = await getCustomer(db, tenantId, id);
  const document = input.document ? stripDocument(input.document) : current.document;
  const documentType = input.document ? assertValidDocument(document) : current.document_type;

  const [row] = await db`
    UPDATE exeq_core.customers SET
      document = ${document},
      document_type = ${documentType},
      name = ${input.name ?? current.name},
      email = ${input.email !== undefined ? input.email : current.email},
      address = ${db.json(asJsonValue(input.address ?? current.address ?? {}))},
      is_active = ${input.is_active ?? current.is_active},
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
    RETURNING id, document, document_type, name, email, address, is_active, created_at, updated_at
  `;
  return row;
}

type CustomerRow = {
  id: string;
  document: string;
  document_type: string;
  name: string;
  email: string | null;
  address: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getCustomer(db: Sql, tenantId: string, id: string): Promise<CustomerRow> {
  const [row] = await db<CustomerRow[]>`
    SELECT id, document, document_type, name, email, address, is_active, created_at, updated_at
    FROM exeq_core.customers
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
  `;
  if (!row) throw new NotFoundError("CUSTOMER");
  return row;
}

export async function listServiceCatalog(db: Sql, tenantId: string) {
  return db`
    SELECT id, service_code, description, lc116_item, is_active, created_at, updated_at
    FROM exeq_core.service_catalog_items
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY service_code
  `;
}

export async function createServiceCatalogItem(
  db: Sql,
  tenantId: string,
  input: CreateServiceCatalogItemInput,
) {
  try {
    const [row] = await db`
      INSERT INTO exeq_core.service_catalog_items (tenant_id, service_code, description, lc116_item)
      VALUES (
        ${tenantId}::uuid, ${input.service_code}, ${input.description}, ${input.lc116_item ?? null}
      )
      RETURNING id, service_code, description, lc116_item, is_active, created_at, updated_at
    `;
    return row;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new DuplicateDocumentError();
    throw err;
  }
}

export async function updateServiceCatalogItem(
  db: Sql,
  tenantId: string,
  id: string,
  input: UpdateServiceCatalogItemInput,
) {
  const current = await getServiceCatalogItem(db, tenantId, id);
  const [row] = await db`
    UPDATE exeq_core.service_catalog_items SET
      service_code = ${input.service_code ?? current.service_code},
      description = ${input.description ?? current.description},
      lc116_item = ${input.lc116_item !== undefined ? input.lc116_item : current.lc116_item},
      is_active = ${input.is_active ?? current.is_active},
      updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
    RETURNING id, service_code, description, lc116_item, is_active, created_at, updated_at
  `;
  return row;
}

type ServiceCatalogRow = {
  id: string;
  service_code: string;
  description: string;
  lc116_item: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getServiceCatalogItem(
  db: Sql,
  tenantId: string,
  id: string,
): Promise<ServiceCatalogRow> {
  const [row] = await db<ServiceCatalogRow[]>`
    SELECT id, service_code, description, lc116_item, is_active, created_at, updated_at
    FROM exeq_core.service_catalog_items
    WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
  `;
  if (!row) throw new NotFoundError("SERVICE");
  return row;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
