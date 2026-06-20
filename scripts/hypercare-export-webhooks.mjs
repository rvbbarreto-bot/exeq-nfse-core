#!/usr/bin/env node
/**
 * Sprint 20 — export CSV webhooks inbox com status=failed.
 * Uso: API_URL=... npm run hypercare:export-webhooks
 * Arquivo: npm run hypercare:export-webhooks -- --out ../docs/evidencias/webhooks-failed.csv
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.API_URL ?? "http://localhost:3000";
const email = process.env.SMOKE_EMAIL ?? "admin@piloto.local";
const password = process.env.SMOKE_PASSWORD ?? "changeme";
const limit = process.env.HYPERCARE_EXPORT_LIMIT ?? "100";

const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;

async function request(method, reqPath, { token, body, accept } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (accept) headers.accept = accept;

  const res = await fetch(`${base}${reqPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function main() {
  const login = await request("POST", "/v1/auth/login", {
    body: { email, password },
  });
  if (login.status !== 200) {
    throw new Error(`Login falhou ${login.status}`);
  }
  const token = login.json.access_token;

  const exportRes = await request(
    "GET",
    `/v1/webhooks/inbox/export?status=failed&limit=${limit}`,
    { token, accept: "text/csv" },
  );
  if (exportRes.status !== 200) {
    throw new Error(`Export webhooks failed ${exportRes.status}`);
  }
  if (!exportRes.text.includes("id,status")) {
    throw new Error("CSV header missing (expected id,status,...)");
  }

  if (outPath) {
    const resolved = path.resolve(process.cwd(), outPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, exportRes.text, "utf-8");
    console.log(`CSV gravado: ${resolved}`);
  } else {
    process.stdout.write(exportRes.text);
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
