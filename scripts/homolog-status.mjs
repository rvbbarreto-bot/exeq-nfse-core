#!/usr/bin/env node
import { homologConfig, fetchExeqHealth, fetchAdmin } from "./homolog-utils.mjs";

console.log(`Homolog status (API :${homologConfig.apiPort}, admin :${homologConfig.adminPort})\n`);

const health = await fetchExeqHealth();
if (health.ok) {
  console.log(`API /health: OK (${health.status}) ${JSON.stringify(health.json)}`);
} else {
  console.log(
    `API /health: OFF — ${health.error ?? JSON.stringify(health.json)} (esperado service=exeq-nfse-core-api)`,
  );
}

const admin = await fetchAdmin();
if (admin.ok) {
  console.log(`Admin: OK (${admin.status})`);
} else {
  console.log(`Admin: OFF — ${admin.error ?? "sem resposta"}`);
}

process.exit(health.ok && admin.ok ? 0 : 1);
