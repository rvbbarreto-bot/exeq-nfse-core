# Troubleshooting — Robot regressão Exeq

## Pré-requisitos

```powershell
cd exeq-nfse-core
npm run dev -w @exeq/api
npm run dev -w @exeq/admin
npm run db:seed -w @exeq/api
```

## Instalação (uma vez)

```powershell
cd robot-regression
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
rfbrowser init
```

## Falhas comuns

| Sintoma | Causa provável | Correção |
|---------|----------------|----------|
| `ECONNREFUSED 5173` | Admin down | Subir Vite admin |
| `API login failed 401` | Seed/credenciais | `db:seed`, conferir `SMOKE_EMAIL` |
| `POST /v1/nf/issues failed` | Master data | Seed completo; conferir providers/services |
| Timeout em `issue-create-charge` | API lenta | Aumentar `DEFAULT_TIMEOUT` em `config/environment.robot` |
| Option `Bragança` não encontrada | Encoding label | Conferir texto exato em `PILOT_MUNICIPIO_LABELS` |
| `rfbrowser init` falha | Playwright browsers | Reexecutar init como admin / antivírus |
| Headless flaky | GPU/DPI | Rodar headed: `--variable HEADLESS:False` |

## Failure triage

1. Abrir `results/log.html` e `results/report.html`
2. Screenshots em `results/evidencias/FAILURE_*.png`
3. Console: `results/logs/*_console.log`
4. Reproduzir caso isolado:

```powershell
robot --loglevel TRACE -d results -t "REG-CHG-02*" tests/regression/
```

## Refactor automação

- Preferir `data-testid` (já mapeados no inventário)
- Evitar `Sleep`; usar `Wait For Load State` / `Wait For Elements State`
- Testes destrutivos de sessão: suite com `Begin Test With Isolated Browser`
