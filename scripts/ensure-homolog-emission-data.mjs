#!/usr/bin/env node
/**
 * Garante prestador + servico para emissao homolog (tenant piloto-sp).
 * Le dados do prestador REAL em .env.local (copiar de .env.homolog.focus.example).
 *
 * Uso: npm run homolog:focus:ensure-data
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  DEFAULT_HOMOLOG_TOMADOR_CNPJ,
  resolveHomologCustomerAddress,
} from "./homolog-tomador-rf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const dbUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const tenantSlug = process.env.HOMOLOG_TENANT_SLUG ?? "piloto-sp";
const providerCnpj = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "").replace(/\D/g, "");
const providerName = process.env.HOMOLOG_PROVIDER_LEGAL_NAME;
const municipalReg = process.env.HOMOLOG_PROVIDER_MUNICIPAL_REGISTRATION;
const taxRegime = process.env.HOMOLOG_PROVIDER_TAX_REGIME ?? "simples_nacional";
const serviceCode = process.env.HOMOLOG_SERVICE_CODE ?? "1.01";
const serviceDesc =
  process.env.HOMOLOG_SERVICE_DESCRIPTION ?? "Analise e desenvolvimento de sistemas";
const customerDocRaw = (process.env.HOMOLOG_CUSTOMER_DOCUMENT ?? "").replace(/\D/g, "");
/** CPF fictício do seed gera E0207; mesmo CNPJ do prestador gera E0202 em produção. */
const customerDoc = (() => {
  if (customerDocRaw && customerDocRaw !== "52998224725" && customerDocRaw !== providerCnpj) {
    return customerDocRaw;
  }
  return DEFAULT_HOMOLOG_TOMADOR_CNPJ;
})();
const customerName = process.env.HOMOLOG_CUSTOMER_NAME ?? "Tomador Teste Homolog PJ";
const customerAddress = resolveHomologCustomerAddress(process.env);
const customerDocType = customerDoc.length === 14 ? "cnpj" : customerDoc.length === 11 ? "cpf" : null;

if (!providerCnpj || providerCnpj.length !== 14 || providerCnpj === "00000000000000") {
  console.error(`
Configure o prestador REAL em .env.local (copie .env.homolog.focus.example):

  HOMOLOG_PROVIDER_CNPJ=11222333000181
  HOMOLOG_PROVIDER_LEGAL_NAME=Sua Empresa LTDA
  HOMOLOG_PROVIDER_MUNICIPAL_REGISTRATION=12345

O CNPJ deve ser o mesmo cadastrado na Focus homologacao.
`);
  process.exit(1);
}

if (!customerDocType) {
  console.error(`
HOMOLOG_CUSTOMER_DOCUMENT invalido (use CPF 11 digitos ou CNPJ 14).
Para NFS-e Nacional homolog, prefira CNPJ ativo na Receita Federal (CPF ficticio gera E0207).
`);
  process.exit(1);
}

const sql = postgres(dbUrl);

const [tenant] = await sql`SELECT id FROM exeq_core.tenants WHERE slug = ${tenantSlug} LIMIT 1`;
if (!tenant) {
  console.error(`Tenant nao encontrado: ${tenantSlug}. Rode npm run db:setup`);
  process.exit(1);
}

const tenantId = tenant.id;

const [existingProvider] = await sql`
  SELECT id FROM exeq_core.providers
  WHERE tenant_id = ${tenantId}::uuid AND document = ${providerCnpj}
  LIMIT 1
`;

let providerId = existingProvider?.id;
if (!providerId) {
  const [row] = await sql`
    INSERT INTO exeq_core.providers (
      tenant_id, document, legal_name, municipal_registration, tax_regime, address
    ) VALUES (
      ${tenantId}::uuid,
      ${providerCnpj},
      ${providerName ?? "Prestador Homologacao"},
      ${municipalReg ?? null},
      ${taxRegime}::exeq_core.tax_regime,
      '{}'::jsonb
    )
    RETURNING id
  `;
  providerId = row.id;
  console.log(`OK — Prestador criado: ${providerCnpj}`);
} else {
  console.log(`OK — Prestador ja existe: ${providerCnpj}`);
}

const providerAddress = {
  ibge_code: process.env.HOMOLOG_PROVIDER_IBGE ?? "3504107",
  street: "Rua Homologacao",
  number: "100",
  district: "Centro",
  zip_code: "12940000",
};
await sql`
  UPDATE exeq_core.providers
  SET address = ${sql.json(providerAddress)},
      municipal_registration = COALESCE(municipal_registration, ${municipalReg ?? null}),
      legal_name = COALESCE(NULLIF(legal_name, ''), ${providerName ?? "Prestador Homologacao"})
  WHERE tenant_id = ${tenantId}::uuid AND document = ${providerCnpj}
`;

const [existingService] = await sql`
  SELECT id FROM exeq_core.service_catalog_items
  WHERE tenant_id = ${tenantId}::uuid AND service_code = ${serviceCode}
  LIMIT 1
`;

if (!existingService) {
  await sql`
    INSERT INTO exeq_core.service_catalog_items (
      tenant_id, service_code, description, lc116_item, is_active
    ) VALUES (
      ${tenantId}::uuid,
      ${serviceCode},
      ${serviceDesc},
      ${serviceCode},
      true
    )
  `;
  console.log(`OK — Servico criado: ${serviceCode}`);
} else {
  console.log(`OK — Servico ja existe: ${serviceCode}`);
}

const [existingCustomer] = await sql`
  SELECT id FROM exeq_core.customers
  WHERE tenant_id = ${tenantId}::uuid AND document = ${customerDoc}
  LIMIT 1
`;

if (!existingCustomer) {
  await sql`
    INSERT INTO exeq_core.customers (tenant_id, document, document_type, name, address)
    VALUES (
      ${tenantId}::uuid,
      ${customerDoc},
      ${customerDocType},
      ${customerName},
      ${sql.json(customerAddress)}
    )
  `;
  console.log(`OK — Tomador criado: ${customerDocType.toUpperCase()} ${customerDoc}`);
} else {
  await sql`
    UPDATE exeq_core.customers
    SET document_type = ${customerDocType},
        name = ${customerName},
        address = ${sql.json(customerAddress)}
    WHERE id = ${existingCustomer.id}::uuid
  `;
  console.log(`OK — Tomador atualizado: ${customerDocType.toUpperCase()} ${customerDoc} (CEP ${customerAddress.zip_code} / IBGE ${customerAddress.ibge_code})`);
}

const nfsenOverrides = {
  regime_tributario_simples_nacional: 1,
};
await sql`
  UPDATE exeq_core.municipal_tax_rules
  SET focus_field_overrides = ${sql.json(nfsenOverrides)}
  WHERE tenant_id = ${tenantId}::uuid AND ibge_code = '3504107'
`;
console.log("OK — Overrides NFS-e Nacional Atibaia (regApTribSN=1)");
console.log("OK — Regra municipal E0120: tabela municipal_emission_rules (migration 0013)");

await sql.end();
console.log("\nMaster data homolog pronto. Cadastre o token: npm run homolog:focus:save-token\n");
