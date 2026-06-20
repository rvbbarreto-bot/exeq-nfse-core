#!/usr/bin/env node
/**
 * Diagnóstico tpAmb DPS — envia DPS mínima com tpAmb=1 e tpAmb=2.
 * Uso: npm run homolog:betha:tpamb-diagnose
 */
import { config } from "dotenv";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const apiSrc = path.join(root, "apps/api/src");

async function importApi(relPath) {
  return import(pathToFileURL(path.join(apiSrc, relPath)).href);
}

async function main() {
  const { env } = await importApi("config/env.js");
  const { getDb, withTenant, closeDb } = await importApi("db/client.js");
  const { resolveTenantIdBySlug } = await importApi("modules/platform/tenant-resolver.js");
  const { getTenantSecret } = await importApi("modules/platform/secret-vault.service.js");
  const { mapExeqNfseV1ToBethaDps } = await importApi(
    "modules/integration/nfse/betha/betha-dps.adapter.js",
  );
  const { buildBethaDpsUnsignedXml, extractBethaDpsListaMensagem } = await importApi(
    "modules/integration/nfse/betha/betha-dps-xml.builder.js",
  );
  const { loadPfxMaterial } = await importApi("modules/integration/nfse/betha/betha-pfx.utils.js");
  const { signBethaDpsXml } = await importApi("modules/integration/nfse/betha/betha-xml-signer.js");
  const { BethaDpsSoapClient } = await importApi(
    "modules/integration/nfse/betha/betha-dps-soap.client.js",
  );

const tenantSlug = process.env.HOMOLOG_TENANT_SLUG ?? "piloto-sp";
const cnpj = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "");
const todayBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const sampleDto = {
    schema_version: "exeq.nfse.v1",
    prestador: {
      cnpj,
      razao_social: process.env.HOMOLOG_PROVIDER_LEGAL_NAME ?? "EXEQ TECNOLOGIA LTDA",
      inscricao_municipal: process.env.HOMOLOG_PROVIDER_MUNICIPAL_REGISTRATION ?? "64021",
      regime_tributario: "simples_nacional",
    },
    tomador: {
      documento: process.env.HOMOLOG_CUSTOMER_DOCUMENT ?? "52998224725",
      nome: process.env.HOMOLOG_CUSTOMER_NAME ?? "Tomador Homologacao",
      email: "tomador@homolog.local",
    },
    servico: {
      codigo: "1.01",
      descricao: "Analise e desenvolvimento de sistemas",
      ibge_prestacao: "3504107",
      valor_servico_cents: 100,
      competencia: todayBr,
    },
    tributacao: {
      iss_aliquota: 0.02,
      iss_retido: false,
      irrf_aliquota: 0,
      pis_aliquota: 0,
      cofins_aliquota: 0,
      csll_aliquota: 0,
    },
  };

  const tenantId = await resolveTenantIdBySlug(tenantSlug);
  const secrets = await withTenant(tenantId, async (tx) => ({
    cert: await getTenantSecret(tx, tenantId, "betha_certificate"),
    pwd: await getTenantSecret(tx, tenantId, "betha_certificate_password"),
  }));

  if (!secrets.cert || !secrets.pwd) {
    console.error("FALTA certificado no vault");
    process.exit(1);
  }

  const material = loadPfxMaterial(secrets.cert, secrets.pwd);
  const client = new BethaDpsSoapClient({
    wsdlUrl: env.BETHA_WSDL_URL ?? "https://nota-eletronica.betha.cloud/dps/ws/service.wsdl",
    wsUrl: env.BETHA_WS_URL,
    certificatePfxBase64: secrets.cert,
    certificatePassword: secrets.pwd,
  });

  console.log("=== Betha DPS — diagnóstico tpAmb (Atibaia 3504107) ===\n");
  console.log(`CNPJ prestador: ${cnpj}`);
  console.log(`Portal .env: ${process.env.BETHA_PORTAL_AMBIENTE ?? "(não definido)"}`);
  console.log(`tpAmb .env: ${process.env.BETHA_DPS_TP_AMB ?? "2"}\n`);

  const results = [];

  for (const tpAmb of [1, 2]) {
    const ref = `diag-tpamb-${tpAmb}-${Date.now()}`;
    const dpsPayload = mapExeqNfseV1ToBethaDps(sampleDto, ref, {
      tpAmb,
      defaultNbs: env.BETHA_DEFAULT_NBS,
    });
    const signed = signBethaDpsXml(buildBethaDpsUnsignedXml(dpsPayload), material);
    const tpInXml = signed.match(/<tpAmb>([12])<\/tpAmb>/)?.[1];
    console.log(`--- tpAmb=${tpAmb} (XML confirma: ${tpInXml}) ---`);
    try {
      const { protocolo } = await client.recepcionarDps(signed);
      console.log(`   OK — protocolo=${protocolo}`);
      results.push({ tpAmb, ok: true, protocolo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = msg.match(/BETHA_DPS_([A-Z0-9]+)/)?.[1] ?? "?";
      const body = msg.includes(":") ? msg.split(":").slice(1).join(":") : msg;
      const parsed = extractBethaDpsListaMensagem(body);
      console.log(`   ERRO — ${code}: ${parsed?.mensagem ?? msg.slice(0, 220)}`);
      results.push({ tpAmb, ok: false, code, mensagem: parsed?.mensagem });
    }
    console.log("");
  }

  const winner = results.find((r) => r.ok);
  if (winner) {
    console.log(`RECOMENDAÇÃO: BETHA_DPS_TP_AMB=${winner.tpAmb}`);
    console.log(
      `             BETHA_PORTAL_AMBIENTE=${winner.tpAmb === 1 ? "producao" : "homolog"}`,
    );
  } else {
    const r1 = results.find((r) => r.tpAmb === 1);
    const r2 = results.find((r) => r.tpAmb === 2);
    if (r2?.code === "E130" && r1?.code === "E270") {
      console.log("DIAGNÓSTICO: Cadastro prestador = HOMOLOG (tpAmb=2) ✓ alinhado ao portal PO.");
      console.log("             Homolog DPS Nota Nacional SUSPENSO pela Betha (E130).");
      console.log("             tpAmb=1 rejeitado (E270) — prestador NÃO está em produção.");
      console.log("\nAÇÃO PO (manter homolog): abrir chamado Betha citando E130 + Atibaia + DPS.");
      console.log("AÇÃO alternativa: migrar cadastro portal para produção + tpAmb=1 (NFS-e real ADN).");
    } else {
      console.log(`Códigos: ${results.map((r) => `tpAmb${r.tpAmb}=${r.code}`).join(", ")}`);
    }
  }

  getDb();
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
