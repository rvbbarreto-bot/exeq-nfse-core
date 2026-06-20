-- PO 2026-06: Atibaia exclusivamente Focus Nacional (Betha descartado para 3504107)
UPDATE exeq_core.municipal_nfse_routing
SET provider_kind = 'focus_nacional',
    wsdl_url = NULL,
    updated_at = now()
WHERE ibge_code = '3504107';

INSERT INTO exeq_core.municipal_nfse_routing (ibge_code, provider_kind, wsdl_url)
VALUES ('3504107', 'focus_nacional', NULL)
ON CONFLICT (ibge_code) DO UPDATE
SET provider_kind = EXCLUDED.provider_kind,
    wsdl_url = EXCLUDED.wsdl_url,
    updated_at = now();
