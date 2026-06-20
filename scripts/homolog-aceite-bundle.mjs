#!/usr/bin/env node
/**
 * US-OP-17-01 — Pacote markdown para aceite PO/QA (Release 2, 3 municípios).
 * Uso: npm run homolog:aceite:bundle
 * Opcional: --run-handoff (executa homolog:handoff:full antes; exige stack homolog)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homologConfig } from "./homolog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveRepoDocs() {
  const candidates = [
    path.resolve(root, "../docs"),
    path.resolve(root, "../EmissaoNFSe/docs"),
    path.resolve(root, "../../EmissaoNFSe/docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "GO_LIVE_PILOTO_CHECKLIST.md"))) return candidate;
  }
  return candidates[0];
}

const repoDocs = resolveRepoDocs();
const day = new Date().toISOString().slice(0, 10);
const outDir = path.join(repoDocs, "evidencias");
const outFile = path.join(outDir, `HOMOLOG_ACEITE_BUNDLE_${day}.md`);

const pilotIbge = ["3504107", "3507605", "3528502", "3547809"];
const runHandoff = process.argv.includes("--run-handoff");

if (runHandoff) {
  console.log("=== Executando homolog:handoff:full (pode demorar) ===\n");
  const handoff = spawnSync("node", ["scripts/homolog-handoff.mjs", "--portal", "--gateway"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (handoff.status !== 0) {
    console.error("\nBundle abortado — handoff falhou.\n");
    process.exit(1);
  }
}

const body = `# Pacote aceite homolog — Release 2 (${day})

| Campo | Valor |
|-------|-------|
| **Escopo PO** | 3 municípios H3 |
| **IBGE** | ${pilotIbge.join(", ")} |
| **API homolog** | ${homologConfig.apiBase} |
| **Admin** | ${homologConfig.adminBase} |

---

## Gates executados pela fábrica

| Gate | Comando | Resultado (preencher) |
|------|---------|------------------------|
| CI | \`npm run validate:ci\` | [ ] PASS |
| Preflight | \`npm run go-live:preflight\` | [ ] PASS |
| Handoff API | \`npm run homolog:smoke\` | [ ] PASS |
| Handoff portal | \`npm run homolog:handoff:portal\` | [ ] PASS |
| Handoff full | \`npm run homolog:handoff:full\` | ${runHandoff ? "[x] executado neste bundle" : "[ ] opcional"} |

---

## UAT portal (E2E)

Referência: \`docs/DEMANDA_PO_FABRICA_HOMOLOG_PORTAL_100.md\`

- [ ] UAT-P0-01..09 — Playwright verde OU prints QA anexados
- [ ] Dashboard hypercare (5 cards) — \`data-testid=dashboard-hypercare\`

---

## Aceite PO

| Papel | Nome | Data | OK |
|-------|------|------|-----|
| QA | | | [ ] |
| PO | Ricardo Barreto | | [ ] |

**Observação:** aceite pode ser por E2E CI + este bundle, sem prints manuais, se PO delegar (Release 2 §5).

---

## Anexos sugeridos

1. Log deste comando + \`homolog:handoff:full\`
2. \`docs/evidencias/VALIDACAO_ENTREGA_RELEASE_2_2026-05-25.md\`
3. Prints opcionais (pasta Issue GitHub)

---

_Gerado por \`npm run homolog:aceite:bundle\` (Sprint 17)._
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, body, "utf-8");

console.log(`\nPacote aceite gravado: ${outFile}\n`);
console.log("Próximo: QA/PO marcar gates na tabela e anexar na Issue de homolog.\n");
