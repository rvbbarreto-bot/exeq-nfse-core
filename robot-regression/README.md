# Robot Framework — Regressão Exeq Admin

Suíte **enterprise** (Page Objects + Keyword Driven + Browser Library / Playwright) para o portal **Exeq Admin** NFSe.

## Contexto aplicado

| Item | Valor |
|------|-------|
| **URL** | `http://127.0.0.1:5173` |
| **API** | `http://127.0.0.1:3002` |
| **Login** | `admin@piloto.local` / `changeme` |
| **Ambiente** | HOMOLOG local |
| **Módulos** | Dashboard, Emissões, Cobranças, Webhooks, Catálogos |

Documentação técnica: [`docs/INVENTARIO_TECNICO.md`](docs/INVENTARIO_TECNICO.md)

## Estrutura

```
robot-regression/
  config/          # environment.robot
  variables/       # selectors.robot
  pages/           # Page Objects
  keywords/        # auth, navigation, api
  resources/       # browser, evidence, network
  tests/
    smoke/         # gate rápido
    regression/    # suíte profunda
  results/         # output (gitignored)
  docs/            # inventário, risco, BDD, troubleshooting
```

## Instalação

```powershell
cd exeq-nfse-core\robot-regression
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
rfbrowser init
```

## Execução

```powershell
# Stack homolog no ar (API + Admin + seed)

robot -d ./results tests/

robot --variable HEADLESS:True -d ./results tests/

robot --loglevel TRACE -d ./results tests/smoke/

robot -d ./results -i smoke tests/
robot -d ./results -i regression tests/
```

Override URLs:

```powershell
robot --variable ADMIN_BASE_URL:http://homolog.exeq.local:5173 -d results tests/
```

## Evidências

- Screenshots: `results/evidencias/`
- Logs console/rede: `results/logs/`
- Relatório: `results/report.html`, `results/log.html`

## Quality gates

- Sem `Sleep` fixo
- Seletores `data-testid` prioritários
- Retry em assertions (`retry_assertions_for=3`)
- Screenshot automático em falha
