#!/usr/bin/env node
/** Purga workflows n8n duplicados — mantém apenas V15 ativo. */
import { spawnSync } from "node:child_process";

const container = "nfse-n8n";
const keepName = "exeq-nfse-canal-whatsapp-v15";

function docker(args, inherit = false) {
  return spawnSync("docker", ["exec", container, ...args], {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
}

const list = docker(["n8n", "list:workflow"]);
const rows = (list.stdout || "")
  .split(/\r?\n/)
  .filter((l) => l.includes("|"))
  .map((l) => {
    const [id, name] = l.split("|");
    return { id: id?.trim(), name: name?.trim() };
  });

let keepId = rows.filter((r) => r.name === keepName).at(-1)?.id;
console.log(`Workflows encontrados: ${rows.length}`);

for (const row of rows) {
  docker(["n8n", "update:workflow", `--id=${row.id}`, "--active=false"], true);
  if (row.name === keepName && row.id === keepId) continue;
  console.log(`delete ${row.id} (${row.name})`);
  docker(["n8n", "delete:workflow", `--id=${row.id}`], true);
}

if (!keepId) {
  console.error("V15 não encontrado — rode npm run channel:import-workflow");
  process.exit(1);
}

docker(["n8n", "update:workflow", `--id=${keepId}`, "--active=true"], true);
spawnSync("docker", ["restart", container], { stdio: "inherit" });
console.log(`OK — único workflow ativo: ${keepId}`);
