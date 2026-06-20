*** Settings ***
Documentation    Configuração central — URLs, credenciais e timeouts (placeholders via env).

*** Variables ***
# URLs (override: --variable ADMIN_BASE_URL:https://...)
${ADMIN_BASE_URL}        %{ADMIN_BASE_URL=http://127.0.0.1:5173}
${API_BASE_URL}          %{API_BASE_URL=http://127.0.0.1:3002}
${LOGIN_PATH}            /login
${DASHBOARD_PATH}        /

# Credenciais homolog padrão (seed piloto)
${LOGIN_EMAIL}           %{SMOKE_EMAIL=admin@piloto.local}
${LOGIN_PASSWORD}        %{SMOKE_PASSWORD=changeme}
${TENANT_SLUG}           %{TENANT_SLUG=piloto-sp}

# Execução
${HEADLESS}              ${False}
${BROWSER_CHANNEL}       chromium
${VIEWPORT_WIDTH}        1440
${VIEWPORT_HEIGHT}       900
${DEFAULT_TIMEOUT}       30s
${NAVIGATION_TIMEOUT}    45s
${RETRY_COUNT}           3

# Evidências
${RESULTS_DIR}           ${CURDIR}${/}..${/}results
${EVIDENCE_DIR}          ${RESULTS_DIR}${/}evidencias
${SCREENSHOT_DIR}        ${RESULTS_DIR}${/}screenshots
${LOG_DIR}               ${RESULTS_DIR}${/}logs

# Piloto PO (4 IBGE operacionais pós Sprint 15)
@{PILOT_IBGE_CODES}      3504107    3507605    3528502    3547809
@{PILOT_MUNICIPIO_LABELS}    Atibaia    Bragança Paulista    Mairiporã    Santo André
