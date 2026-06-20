# Runbook — Betha Atibaia certificado + SOAP Cloud (S1-09)

| Campo | Valor |
|-------|-------|
| **Município** | Atibaia/SP — IBGE `3504107` |
| **Provedor** | Betha Cloud RPS (ABRASF/SOAP) |
| **Decisão URLs** | [DECISAO_TECNICA_BETHA_WS_URL_ATIBAIA_2026-06-19.md](../../../Projeto_Emissao_NFSe/DECISAO_TECNICA_BETHA_WS_URL_ATIBAIA_2026-06-19.md) |
| **Autorização PO** | [AUTORIZACAO_PO_BETHA_SOAP_REAL_2026-06-19.md](../../../Projeto_Emissao_NFSe/AUTORIZACAO_PO_BETHA_SOAP_REAL_2026-06-19.md) |

---

## 1. URLs — o que usar e o que NÃO usar

| URL | Uso |
|-----|-----|
| [login.betha.cloud](https://login.betha.cloud/servicelogin/login.faces) | **Portal humano** — ativar *Ambiente de Homologação* no painel. **Não** é WSDL. |
| `https://nota-eletronica.betha.cloud/rps/ws` | Base RPS — **não** append `?wsdl` (405). |
| `.../recepcionarLoteRps?wsdl` | **Submit** — `BETHA_WSDL_URL` |
| `.../consultarLoteRps?wsdl` | **Consulta** — `BETHA_WSDL_CONSULTAR_URL` |
| `e-gov.betha.com.br/...-test-ws/nfseWS?wsdl` | Legado Fly e-Nota — **não** para Atibaia Cloud |

---

## 2. Variáveis `.env.local` (S1-10 DPS — SOAP real)

```env
BETHA_ATIBAIA_ENABLED=true
BETHA_INTEGRATION_MODE=dps
BETHA_WSDL_URL=https://nota-eletronica.betha.cloud/dps/ws/service.wsdl
BETHA_WS_URL=https://nota-eletronica.betha.cloud/dps/ws
BETHA_DPS_TP_AMB=1
BETHA_MOCK=false
HOMOLOG_TEST_AMOUNT_CENTS=100
```

> **E130:** Betha suspendeu homolog DPS Nota Nacional — use `tpAmb=1` (produção ADN). Piloto: R$ 1,00.

Template completo: `.env.homolog.betha.example`

---

## 3. Pré-requisitos PO

| Item | Status |
|------|--------|
| Certificado A1 no vault (`npm run homolog:betha:save-certificate`) | ✅ |
| **Ambiente de Homologação** ativo no painel Betha | PO / Contador |
| WSDL Cloud por operação | ✅ Decisão PO |
| NFS-e teste R$ 1,00 | ✅ Autorizado |

---

## 4. Comandos

```powershell
cd exeq-nfse-core
npm run homolog:ready-for-qa
npm run homolog:betha:preflight
npm run homolog:emission:atibaia:betha:real
```

---

## 5. Requisitos técnicos Betha Cloud

1. **TLS mútuo** — PFX no handshake HTTPS (`betha-soap.client.ts`)
2. **XMLDSig SHA1** — assinatura em `<Rps>` e `<LoteRps>` (pendente S1-09b)
3. **Homolog flag** — mesma URL prod/test; diferenciação no painel contribuinte

---

## 6. Validação rápida (SoapUI)

1. Preferences → SSL Settings → carregar `.pfx`
2. WSDL: `consultarLoteRps?wsdl`
3. Método `ConsultarLoteRps` — XML estruturado (mesmo com erro de negócio) = canal OK

---

*Runbook S1-09 — Betha Cloud Atibaia — 2026-06-19.*
