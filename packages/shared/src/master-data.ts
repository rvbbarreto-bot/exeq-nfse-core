import { z } from "zod";
import { taxRegimeSchema } from "./fiscal.js";

export const addressSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  uf: z.string().length(2).optional(),
  zip_code: z.string().optional(),
  ibge_code: z.string().length(7).optional(),
});

export type Address = z.infer<typeof addressSchema>;

export const createProviderSchema = z.object({
  document: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 digitos"),
  legal_name: z.string().min(2).max(255),
  trade_name: z.string().max(255).optional(),
  municipal_registration: z.string().max(32).optional(),
  tax_regime: taxRegimeSchema,
  address: addressSchema.default({}),
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;

export const updateProviderSchema = createProviderSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;

export const createCustomerSchema = z.object({
  document: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11) ou CNPJ (14) digitos"),
  name: z.string().min(2).max(255),
  email: z.string().email().optional(),
  address: addressSchema.default({}),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const createServiceCatalogItemSchema = z.object({
  service_code: z.string().min(1).max(32),
  description: z.string().min(2).max(500),
  lc116_item: z.string().max(16).optional(),
});

export type CreateServiceCatalogItemInput = z.infer<typeof createServiceCatalogItemSchema>;

export const updateServiceCatalogItemSchema = createServiceCatalogItemSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type UpdateServiceCatalogItemInput = z.infer<typeof updateServiceCatalogItemSchema>;
