import type { Address } from "./master-data.js";
import { addressSchema } from "./master-data.js";
import { z } from "zod";

/** Endereço do tomador informado na solicitação de emissão (CEP × IBGE coerentes — evita E0240). */
export const emitTomadorAddressSchema = z.object({
  street: z.string().min(1).max(255),
  number: z.string().min(1).max(32),
  district: z.string().min(1).max(120),
  zip_code: z.string().regex(/^\d{8}$/, "CEP deve ter 8 digitos"),
  ibge_code: z.string().length(7).regex(/^\d{7}$/),
  complement: z.string().max(120).optional(),
  uf: z.string().length(2).optional(),
});

export type EmitTomadorAddress = z.infer<typeof emitTomadorAddressSchema>;

/** Tomador na request de emissão — sobrescreve cadastro quando informado. */
export const emitTomadorSchema = z.object({
  document: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11) ou CNPJ (14) digitos").optional(),
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  address: emitTomadorAddressSchema,
});

export type EmitTomador = z.infer<typeof emitTomadorSchema>;

export type CustomerLike = {
  document: string;
  name: string;
  email: string | null;
  address: Record<string, unknown> | null;
};

function stripZip(value: string): string {
  return value.replace(/\D/g, "");
}

function coerceAddressRecord(addr: Record<string, unknown> | null | undefined): Address | undefined {
  if (!addr || typeof addr !== "object") return undefined;
  const parsed = addressSchema.safeParse(addr);
  return parsed.success ? parsed.data : undefined;
}

/** Mescla tomador inline da emissão sobre o cadastro do cliente. */
export function mergeEmitTomadorIntoCustomer(
  customer: CustomerLike,
  tomador?: EmitTomador,
): CustomerLike {
  if (!tomador) return customer;

  const baseAddr = coerceAddressRecord(customer.address) ?? {};
  const mergedAddress = {
    ...baseAddr,
    ...tomador.address,
    zip_code: stripZip(tomador.address.zip_code),
  };

  return {
    document: tomador.document ?? customer.document,
    name: tomador.name ?? customer.name,
    email: tomador.email !== undefined ? tomador.email : customer.email,
    address: mergedAddress,
  };
}

export function isCompleteTomadorAddress(endereco: Address | undefined): boolean {
  if (!endereco) return false;
  const zip = stripZip(endereco.zip_code ?? "");
  return Boolean(
    endereco.street?.trim() &&
      endereco.number?.trim() &&
      endereco.district?.trim() &&
      zip.length === 8 &&
      endereco.ibge_code?.length === 7,
  );
}
