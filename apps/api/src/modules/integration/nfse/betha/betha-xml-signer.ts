import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import type { PfxMaterial } from "./betha-pfx.utils.js";

/** Assina infDPS (XMLDSig SHA1) e anexa Signature dentro de DPS. */
export function signBethaDpsXml(unsignedDpsXml: string, material: PfxMaterial): string {
  const doc = new DOMParser().parseFromString(unsignedDpsXml, "text/xml");
  const infNodes = doc.getElementsByTagName("infDPS");
  if (!infNodes.length || !infNodes.item(0)?.getAttribute("id")) {
    throw new Error("BETHA_DPS_SIGN_MISSING_INFDPS_ID");
  }

  const sig = new SignedXml({
    privateKey: material.keyPem,
    publicCert: material.certPem,
  });
  sig.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
  sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  sig.addReference({
    xpath: "//*[local-name()='infDPS']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });

  sig.computeSignature(new XMLSerializer().serializeToString(doc), {
    location: { reference: "//*[local-name()='DPS']", action: "append" },
  });

  return sig.getSignedXml();
}
