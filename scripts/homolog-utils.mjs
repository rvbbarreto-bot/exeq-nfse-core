import { execSync } from "node:child_process";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });

export const homologConfig = {
  root,
  apiPort: process.env.PORT ?? "3000",
  adminPort: process.env.ADMIN_PORT ?? "5173",
  apiBase: `http://localhost:${process.env.PORT ?? "3000"}`,
  adminBase: `http://localhost:${process.env.ADMIN_PORT ?? "5173"}`,
  email: process.env.SMOKE_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@piloto.local",
  password: process.env.SMOKE_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "changeme",
};

/** Valor padrão NFS-e homolog — PO: R$ 1,00 */
export const homologTestAmountCents = Number(process.env.HOMOLOG_TEST_AMOUNT_CENTS ?? "100");

export async function fetchExeqHealth(port = homologConfig.apiPort) {
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5000) });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok && json.service === "exeq-nfse-core-api" && json.status === "ok",
      status: res.status,
      json,
    };
  } catch (err) {
    return { ok: false, status: 0, json: {}, error: err.message };
  }
}

export async function fetchAdmin(port = homologConfig.adminPort) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

/** Encerra workers de emissão órfãos (Windows). */
export function killEmissionWorkers() {
  if (process.platform !== "win32") {
    console.warn("[homolog] killEmissionWorkers: só Windows suportado");
    return 0;
  }
  try {
    const workersScript = path.join(homologConfig.root, "scripts", "kill-exeq-workers.ps1");
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${workersScript}"`, {
      encoding: "utf8",
      stdio: "inherit",
    });
    return 1;
  } catch {
    return 0;
  }
}

export function killPortListeners(port) {
  if (process.platform !== "win32") {
    console.warn(`[homolog] killPortListeners: só Windows suportado (porta ${port})`);
    return 0;
  }
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { encoding: "utf8", stdio: "ignore", shell: true, env: { ...process.env } },
    );
    return 1;
  } catch {
    return 0;
  }
}

export function dockerComposePs() {
  try {
    return execSync("docker compose ps --format json", { cwd: homologConfig.root, encoding: "utf8" });
  } catch {
    return "";
  }
}

export function dockerComposeUp() {
  execSync("docker compose up -d", { cwd: homologConfig.root, stdio: "inherit" });
}

/** Limpa filas BullMQ NF (homolog — evita workers órfãos processarem jobs). */
export async function flushBullNfQueues() {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    for (const pattern of ["bull:nf-emission:*", "bull:nf-polling:*"]) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
  } finally {
    await redis.quit();
  }
}

/** fetch com retry — mitiga ECONNRESET/transientes em homolog Windows. */
export async function fetchWithRetry(url, options = {}, opts = {}) {
  const retries = opts.retries ?? 5;
  const delayMs = opts.delayMs ?? 2000;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
