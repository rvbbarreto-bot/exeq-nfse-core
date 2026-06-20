#!/usr/bin/env node
/**
 * Onboarding de município — cadastra regras em municipal_emission_rules
 * e sincroniza municipal_nfse_routing (provider_kind).
 *
 * Uso:
 *   node scripts/onboard-municipio.mjs --ibge 3504107 --nome Atibaia --uf SP \
 *     --provider focus_nacional --enviar-im false
 *
 * Variáveis:
 *   API_URL, SMOKE_EMAIL, SMOKE_PASSWORD (admin tenant_admin)
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

function parseArgs(argv) {
  const out = {
    ibge: "",
    nome: "",
    uf: "",
    provider: "focus_nacional",
    enviarIm: true,
    usaNfseNacional: true,
    observacao: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ibge") out.ibge = argv[++i] ?? "";
    else if (a === "--nome") out.nome = argv[++i] ?? "";
    else if (a === "--uf") out.uf = argv[++i] ?? "";
    else if (a === "--provider") out.provider = argv[++i] ?? "focus_nacional";
    else if (a === "--enviar-im") out.enviarIm = (argv[++i] ?? "true") === "true";
    else if (a === "--usa-nfse-nacional") out.usaNfseNacional = (argv[++i] ?? "true") === "true";
    else if (a === "--observacao") out.observacao = argv[++i] ?? "";
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!/^\d{7}$/.test(args.ibge) || !args.nome || args.uf.length !== 2) {
    console.error(`
Uso:
  node scripts/onboard-municipio.mjs --ibge <IBGE> --nome <Nome> --uf <UF> \\
    [--provider focus_nacional|betha] [--enviar-im true|false] [--observacao "..."]
`);
    process.exit(1);
  }

  const base = process.env.API_URL ?? homologConfig.apiBase;
  const email = process.env.SMOKE_EMAIL ?? homologConfig.email;
  const password = process.env.SMOKE_PASSWORD ?? homologConfig.password;

  const login = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (login.status !== 200 || !loginBody.access_token) {
    console.error(`FALHA login: HTTP ${login.status}`);
    process.exit(1);
  }

  const h = {
    authorization: `Bearer ${loginBody.access_token}`,
    "content-type": "application/json",
  };

  const body = {
    municipio_nome: args.nome,
    uf: args.uf.toUpperCase(),
    enviar_inscricao_municipal_prestador: args.enviarIm,
    usa_nfse_nacional: args.usaNfseNacional,
    provider_kind: args.provider,
    observacao: args.observacao || null,
    payload_flags: {},
  };

  const res = await fetch(`${base}/v1/fiscal/municipal-rules/${args.ibge}`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify(body),
  });
  const saved = await res.json();
  if (res.status !== 200) {
    console.error("FALHA upsert municipal-rules:", res.status, JSON.stringify(saved));
    process.exit(1);
  }

  console.log("OK — município onboarded");
  console.log(JSON.stringify(saved, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
