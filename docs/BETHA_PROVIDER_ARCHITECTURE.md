# Arquitetura Multi-Provider NFS-e (Focus + Betha)

## Visão

```
INfseProvider (porta)
 ├── FocusNfseProvider   → /v2/nfsen (JSON, token)
 └── BethaNfseProvider   → SOAP/ABRASF (certificado A1/A3) [skeleton]
```

## Arquivos principais

| Caminho | Papel |
|---------|--------|
| `packages/shared/src/nfse-provider.ts` | Tipos compartilhados (`NfseProviderKind`) |
| `apps/api/src/modules/integration/nfse/nfse-provider.types.ts` | Interface `INfseProvider` |
| `apps/api/src/modules/integration/nfse/nfse-provider.factory.ts` | Factory + override para testes |
| `apps/api/src/modules/integration/nfse/nfse-provider.resolver.ts` | Roteamento por IBGE |
| `apps/api/src/modules/integration/nfse/nfse-credentials.service.ts` | Credenciais por provedor |
| `apps/api/src/modules/integration/nfse/focus/focus-nfse.provider.ts` | Adaptador Focus |
| `apps/api/src/modules/integration/nfse/betha/betha-nfse.provider.ts` | Skeleton Betha |
| `apps/api/src/db/migrations/0011_nfse_provider_routing.sql` | Tabela `municipal_nfse_routing` |

## Roteamento Atibaia → Betha

**Regra PO (2026-06-18):** IBGE `3504107` (Atibaia) → **Betha** quando `BETHA_ATIBAIA_ENABLED=true` (Focus não homologada no município).

Por padrão todos os municípios usam `focus_nacional` na tabela até o flag PO ser ligado.

Para habilitar Betha em Atibaia (`3504107`):

```env
BETHA_ATIBAIA_ENABLED=true
BETHA_MOCK=true          # dev/CI sem certificado
BETHA_WSDL_URL=https://... # WSDL oficial quando disponível
```

Credenciais no vault (tenant):

- `betha_certificate` — PFX em base64
- `betha_certificate_password`

## Pendências Betha (implementação real)

1. WSDL oficial Atibaia/SP (documentação municipal)
2. Assinatura XMLDSig ICP-Brasil
3. Mapeamento ABRASF completo (emissão, consulta lote, cancelamento, PDF/XML)
4. Cadastro CNC / IM conforme regras municipais

## Comandos

```bash
npm run db:migrate
npm test -w @exeq/api -- nfse-provider
```
