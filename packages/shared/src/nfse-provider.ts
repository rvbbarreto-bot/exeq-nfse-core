import { z } from "zod";

/** Provedor de emissão NFS-e por município/tenant. */
export const nfseProviderKindSchema = z.enum(["focus_nacional", "betha"]);

export type NfseProviderKind = z.infer<typeof nfseProviderKindSchema>;

export const nfseProviderRoutingSchema = z.object({
  ibge_code: z.string().length(7),
  provider_kind: nfseProviderKindSchema,
  wsdl_url: z.string().url().optional(),
  notes: z.string().max(500).optional(),
});

export type NfseProviderRouting = z.infer<typeof nfseProviderRoutingSchema>;

/** Status normalizado independente do provedor. */
export const nfseExternalStatusSchema = z.enum([
  "processing",
  "authorized",
  "rejected",
  "cancelled",
  "failed",
]);

export type NfseExternalStatus = z.infer<typeof nfseExternalStatusSchema>;

export const nfseProviderErrorSchema = z.object({
  codigo: z.string().optional(),
  mensagem: z.string().optional(),
});

export type NfseProviderError = z.infer<typeof nfseProviderErrorSchema>;
