import forge from "node-forge";

export type PfxMaterial = {
  certPem: string;
  keyPem: string;
};

/** Extrai certificado e chave privada de PFX base64 (A1 ICP-Brasil). */
export function loadPfxMaterial(pfxBase64: string, passphrase: string): PfxMaterial {
  const pfxDer = forge.util.decode64(pfxBase64);
  const asn1 = forge.asn1.fromDer(pfxDer);
  const pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase);

  const certBags = pkcs12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  const keyBags =
    pkcs12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? pkcs12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];

  const cert = certBags?.[0]?.cert;
  const privateKey = keyBags?.[0]?.key;
  if (!cert || !privateKey) {
    throw new Error("BETHA_PFX_PARSE_FAILED");
  }

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(privateKey),
  };
}
