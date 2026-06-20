#!/usr/bin/env node
/**
 * Importa e ativa workflow V15 no container n8n (S1-04).
 * Remove duplicatas via Postgres — apenas uma instância ativa por webhook path.
 * Uso: npm run channel:import-workflow
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = "nfse-n8n";
const pgContainer = "nfse-n8n-postgres";
const pgUser = process.env.N8N_POSTGRES_USER ?? "n8n_nfse";
const pgDb = process.env.N8N_POSTGRES_DB ?? "n8n_nfse";
const workflowFile = "/workflows/exeq-nfse-canal-whatsapp-v15.workflow.json";
const workflowName = "exeq-nfse-canal-whatsapp-v15";
const idRe = /^[A-Za-z0-9]{10,}$/;

function docker(args, inherit = false) {
  const r = spawnSync("docker", ["exec", container, ...args], {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0 && !inherit) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return inherit ? "" : (r.stdout || "").trim();
}

function dockerPg(sql) {
  const r = spawnSync(
    "docker",
    ["exec", pgContainer, "psql", "-U", pgUser, "-d", pgDb, "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || "").trim();
}

function listWorkflows() {
  const out = docker(["n8n", "list:workflow"]);
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => {
      const [id, name] = line.split("|");
      return { id: id?.trim(), name: name?.trim() };
    })
    .filter((w) => w.id && idRe.test(w.id));
}

console.log("=== channel:import-workflow — V15 ===\n");

const running = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], {
  encoding: "utf8",
});
if (running.stdout?.trim() !== "true") {
  console.error("FALHA — container nfse-n8n não está rodando. Rode: npm run channel:up");
  process.exit(1);
}

const before = listWorkflows().filter((w) => w.name === workflowName);
console.log(`1/5 — remover ${before.length} cópia(s) antiga(s) de ${workflowName} (Postgres)`);
dockerPg(`DELETE FROM workflow_entity WHERE name = '${workflowName}';`);
dockerPg(`DELETE FROM shared_workflow WHERE "workflowId" NOT IN (SELECT id FROM workflow_entity);`);

console.log("2/5 — importar workflow V15");
docker(["n8n", "import:workflow", `--input=${workflowFile}`], true);

const imported = listWorkflows().filter((w) => w.name === workflowName);
const active = imported.at(-1);
if (!active) {
  console.error("FALHA — workflow V15 não encontrado após import");
  process.exit(1);
}

if (imported.length > 1) {
  console.log("3/5 — remover duplicatas pós-import");
  for (const w of imported) {
    if (w.id !== active.id) {
      dockerPg(`DELETE FROM workflow_entity WHERE id = '${w.id}';`);
    }
  }
} else {
  console.log("3/5 — uma única instância V15 OK");
}

console.log("4/5 — ativar V15");
docker(["n8n", "update:workflow", `--id=${active.id}`, "--active=true"], true);
console.log(`   ativo: ${active.id}`);

console.log("5/5 — reiniciar n8n (ativação exige restart)");
spawnSync("docker", ["restart", container], { stdio: "inherit" });

console.log("\nOK — aguarde ~25s e rode: npm run homolog:n8n:e2e\n");
