#!/usr/bin/env node
/** Aguarda URLs HTTP ficarem healthy (CI / E2E). Uso: node scripts/ci-wait-health.mjs URL [URL...] */
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Uso: node scripts/ci-wait-health.mjs <url> [url...]");
  process.exit(1);
}

const maxMs = Number(process.env.CI_WAIT_MS ?? 120_000);
const intervalMs = 2_000;

async function waitOne(url) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        console.log(`OK  ${url}`);
        return;
      }
      console.log(`... ${url} HTTP ${res.status}`);
    } catch (err) {
      console.log(`... ${url} ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout (${maxMs}ms) waiting for ${url}`);
}

try {
  for (const url of urls) {
    await waitOne(url);
  }
} catch (err) {
  console.error(`FALHA: ${err.message}`);
  process.exit(1);
}
