#!/usr/bin/env node
/**
 * Preflight Focus Nacional Atibaia — roteamento, token, empresa (habilita_nfsen).
 * Uso: npm run focus:preflight-atibaia
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

const { pathToFileURL } = await import("url");
const importApi = (p) => import(pathToFileURL(path.join(root, "apps/api/src", p)).href);

const focusBase = process.env.FOCUS_BASE_URL ?? "";
const providerCnpj = (process.env.HOMOLOG_PROVIDER_CNPJ ?? "37229907000137").replace(/\D/g, "");

async function main() {
  console.log("=== Preflight Focus Nacional — Atibaia (3504107) ===\n");
  console.log(`FOCUS_BASE_URL: ${focusBase}`);
  console.log(`Prestador: ${providerCnpj}\n`);

  const { getDb, withTenant, closeDb } = await importApi("db/client.js");
  const { resolveTenantIdBySlug } = await importApi("modules/platform/tenant-resolver.js");
  const { getTenantSecret } = await importApi("modules/platform/secret-vault.service.js");
  const { resolveNfseProviderKindFromConfig } = await importApi(
    "modules/integration/nfse/nfse-provider.resolver.js",
  );

  const kind = resolveNfseProviderKindFromConfig("3504107", "focus_nacional");
  console.log(`Roteamento Atibaia: ${kind}`);
  if (kind !== "focus_nacional") {
    console.error("FALHA — esperado focus_nacional");
    process.exit(1);
  }
  console.log("OK — roteamento focus_nacional\n");

  const tenantId = await resolveTenantIdBySlug(process.env.HOMOLOG_TENANT_SLUG ?? "piloto-sp");
  const token = await withTenant(tenantId, (tx) =>
    getTenantSecret(tx, tenantId, "focus_token"),
  );
  if (!token) {
    console.error("FALHA — focus_token ausente no vault. Rode: npm run homolog:focus:save-token");
    process.exit(1);
  }
  console.log(`OK — focus_token vault (${token.length} chars)\n`);

  if (process.env.FOCUS_MOCK === "true") {
    console.log("FOCUS_MOCK=true — sandbox local; preflight Focus HTTP ignorado.\n");
    console.log("AMBIENTE OK para homolog:channel:cutover e QA sandbox.\n");
    getDb();
    await closeDb();
    process.exit(0);
  }

  const auth = `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
  const empresaUrl = `${focusBase}/v2/empresas/${providerCnpj}`;
  const res = await fetch(empresaUrl, { headers: { Authorization: auth } });
  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    console.error("FALHA — token inválido para este ambiente Focus (HTTP 401)");
    process.exit(1);
  }

  if (!res.ok) {
    console.log(`Empresa GET HTTP ${res.status}:`, JSON.stringify(body).slice(0, 400));
    console.log("\nAVISO — não foi possível ler cadastro empresa; emissão pode falhar em habilita_nfsen_producao.");
    getDb();
    await closeDb();
    process.exit(0);
  }

  const habilitaProd =
    body.habilita_nfsen_producao ?? body.habilita_nfsen ?? body.nfsen_habilitado;
  console.log("Empresa Focus:", body.razao_social ?? body.nome ?? "(ok)");
  console.log(`habilita_nfsen_producao: ${habilitaProd ?? "(campo não retornado)"}`);

  if (habilitaProd === false) {
    console.error(`
BLOQUEIO — ative NFS-e Nacional produção no painel Focus:
  https://focusnfe.com.br/e/nfse-nacional
  CNPJ ${providerCnpj}
`);
    process.exit(1);
  }

  console.log("\nAMBIENTE OK — Focus Nacional Atibaia pronto para emissão real.\n");
  getDb();
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
