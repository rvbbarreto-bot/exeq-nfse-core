#!/usr/bin/env node
/** Gera .env para CI a partir de .env.example + overrides. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(root, ".env.example");
const target = path.join(root, ".env");

const overrides = {
  DATABASE_URL: process.env.DATABASE_URL,
  MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL,
  PORT: process.env.PORT ?? "3002",
  GATEWAY_MOCK: process.env.GATEWAY_MOCK ?? "true",
  GATEWAY_SYNC_PROCESSING: process.env.GATEWAY_SYNC_PROCESSING ?? "true",
  NF_SYNC_PROCESSING: process.env.NF_SYNC_PROCESSING ?? "true",
  WEBHOOK_SYNC_PROCESSING: process.env.WEBHOOK_SYNC_PROCESSING ?? "true",
  FOCUS_MOCK: process.env.FOCUS_MOCK ?? "true",
  NODE_ENV: process.env.NODE_ENV ?? "test",
  /** Playwright faz dezenas de logins — rate limit quebra E2E se herdado do .env.example */
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED ?? "false",
  NFSE_ROUTING_POLICY: process.env.NFSE_ROUTING_POLICY ?? "focus_only",
};

let content = readFileSync(example, "utf8");
for (const [key, val] of Object.entries(overrides)) {
  if (val === undefined) continue;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) content = content.replace(re, `${key}=${val}`);
  else content += `\n${key}=${val}`;
}
writeFileSync(target, content, "utf8");
console.log(`CI env written: ${target} (PORT=${overrides.PORT})`);
