#!/usr/bin/env node
/**
 * Sprint 18 — verifica coluna gateway_payment_url (UAT-17 / cobrança).
 * Exit 0 = OK | 1 = ausente | 2 = não foi possível verificar (sem Docker).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const CONTAINER = process.env.POSTGRES_DOCKER_CONTAINER ?? "exeq-nfse-core-postgres-1";

export function checkGatewayPaymentUrlColumn() {
  try {
    const sql =
      "SELECT 1 FROM information_schema.columns WHERE table_schema='exeq_core' AND table_name='charge' AND column_name='gateway_payment_url'";
    const out = execSync(
      `docker exec ${CONTAINER} psql -U exeq -d exeq_nfse -tAc "${sql}"`,
      { cwd: homologConfig.root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return out.trim() === "1";
  } catch {
    return null;
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(process.argv[1]);

if (isMain) {
  const ok = checkGatewayPaymentUrlColumn();
  if (ok === true) {
    console.log("OK  schema gate — exeq_core.charge.gateway_payment_url");
    process.exit(0);
  }
  if (ok === false) {
    console.error("FALHA  gateway_payment_url ausente — rode: npm run db:migrate");
    process.exit(1);
  }
  console.error("AVISO  não foi possível verificar schema (Docker/postgres indisponível)");
  process.exit(2);
}
