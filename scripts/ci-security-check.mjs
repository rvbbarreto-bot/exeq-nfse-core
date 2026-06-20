#!/usr/bin/env node
/**
 * Validações básicas de segurança para CI e hooks locais.
 * Exit 0 = OK | Exit 1 = bloqueia pipeline.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findGitRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    let dir = root;
    while (dir !== path.dirname(dir)) {
      if (existsSync(path.join(dir, ".git"))) return dir;
      dir = path.dirname(dir);
    }
    return root;
  }
}

const repoRoot = findGitRoot();

const errors = [];

function check(name, ok, detail) {
  if (!ok) errors.push({ name, detail });
  const tag = ok ? "OK " : "FAIL";
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function gitTracked(relativePath) {
  try {
    const out = execSync(`git ls-files -- "${relativePath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    return out.length > 0;
  } catch {
    return null;
  }
}

function listTrackedFiles() {
  try {
    return execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    console.log("WARN  git indisponível — secret scan limitado ao filesystem");
    return null;
  }
}

function scanSecrets() {
  const patterns = [
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  const violations = [];
  const files = listTrackedFiles();
  if (!files) return violations;

  for (const ent of files) {
    if (!ent.startsWith("exeq-nfse-core/")) continue;
    if (ent.includes("node_modules") || ent.includes("package-lock.json")) continue;
    if (!/\.(ts|tsx|js|mjs|json|yml|yaml)$/.test(ent)) continue;
    const abs = path.join(repoRoot, ent);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, "utf8");
    for (const re of patterns) {
      if (re.test(content)) violations.push(`${ent}`);
    }
  }
  return violations;
}

console.log("=== CI security check ===\n");

check(".env.example exists", existsSync(path.join(root, ".env.example")));
const envTracked = gitTracked("exeq-nfse-core/.env");
check(".env not tracked", envTracked === false || envTracked === null, envTracked ? "commitado" : undefined);
const envLocalTracked = gitTracked("exeq-nfse-core/.env.local");
check(".env.local not tracked", envLocalTracked === false || envLocalTracked === null);

const secretHits = scanSecrets();
check("Secret scan (tracked files)", secretHits.length === 0, secretHits[0] ?? "OK");

if (errors.length > 0) {
  console.error("\n=== BLOQUEADO — corrija antes de continuar ===");
  for (const e of errors) console.error(`  • ${e.name}: ${e.detail ?? ""}`);
  process.exit(1);
}

console.log("\nSecurity check: OK");
process.exit(0);
