#!/usr/bin/env node
/**
 * Stack canal NFSe — Opção B (n8n :5680 + Evolution :8082)
 *
 *   npm run channel:up
 *   npm run channel:status
 *   npm run channel:down
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envChannel = path.join(root, ".env.channel");
const composeFiles = ["-f", "docker-compose.yml", "-f", "docker-compose.channel.yml"];
const envChannelExample = path.join(root, ".env.channel.example");

function ensureEnvChannel() {
  if (existsSync(envChannel)) return;
  if (!existsSync(envChannelExample)) {
    console.error("FALHA — .env.channel.example ausente");
    process.exit(1);
  }
  copyFileSync(envChannelExample, envChannel);
  console.log("Criado .env.channel a partir do exemplo — edite senhas antes de produção.\n");
}
const cmd = process.argv[2] ?? "status";

function dockerEnv() {
  const env = { ...process.env };
  if (existsSync(envChannel)) {
    config({ path: envChannel, override: true });
  }
  return env;
}

function composeArgs(extra) {
  const args = [...composeFiles];
  if (existsSync(envChannel)) {
    args.unshift("--env-file", envChannel);
  }
  return [...args, ...extra];
}

function runDocker(extra) {
  const r = spawnSync("docker", ["compose", ...composeArgs(extra)], {
    cwd: root,
    stdio: "inherit",
    env: dockerEnv(),
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function checkUrl(label, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    console.log(`${label}: ${res.ok || res.status < 500 ? "OK" : "FAIL"} (${res.status}) ${url}`);
  } catch (err) {
    console.log(`${label}: OFF — ${url} (${err.message})`);
  }
}

async function status() {
  console.log("=== Stack canal NFSe (Opção B) ===\n");
  if (!existsSync(envChannel)) {
    console.log("⚠ .env.channel ausente — copie .env.channel.example\n");
  }
  runDocker(["--profile", "channel", "ps"]);
  console.log("");
  await checkUrl("n8n", "http://localhost:5680/healthz");
  await checkUrl("Evolution", "http://localhost:8082/");
  await checkUrl("API Core", `${homologConfig.apiBase}/health`);
}

if (cmd === "up") {
  ensureEnvChannel();
  runDocker(["--profile", "channel", "up", "-d"]);
  console.log("\nOK — channel profile up");
  console.log("  n8n:       http://localhost:5680");
  console.log("  Evolution: http://localhost:8082");
  console.log("  Runbook:   docs/runbooks/RUNBOOK_CHANNEL_STACK_OPCAO_B.md\n");
} else if (cmd === "down") {
  runDocker(["--profile", "channel", "down"]);
} else if (cmd === "status") {
  await status();
} else {
  console.error("Uso: channel-stack.mjs [up|down|status]");
  process.exit(1);
}
