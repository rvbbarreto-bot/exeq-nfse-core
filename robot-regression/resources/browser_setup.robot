*** Settings ***
Documentation    Setup/teardown global Browser (Playwright) — auto-wait, viewport, timeouts.
Resource         ../config/environment.robot
Resource         ../variables/selectors.robot
Library          Browser    timeout=${DEFAULT_TIMEOUT}    retry_assertions_for=${RETRY_COUNT}
Library          OperatingSystem
Resource         evidence.robot

*** Keywords ***
Setup Browser Suite
    [Documentation]    Abre browser uma vez por suite; registra falha com screenshot.
    Register Keyword To Run On Failure    Capture Failure Evidence
    Create Evidence Directories
    Set Browser Timeout    ${DEFAULT_TIMEOUT}
    New Browser    ${BROWSER_CHANNEL}    headless=${HEADLESS}
    New Context    viewport={"width": ${VIEWPORT_WIDTH}, "height": ${VIEWPORT_HEIGHT}}    acceptDownloads=${True}
    New Page    about:blank
    Enable Console And Network Monitors

Teardown Browser Suite
    [Documentation]    Fecha browser e persiste log de console na suite.
    Save Console Log To Evidence    suite_teardown
    Close Browser

Setup Browser Test
    [Documentation]    Novo contexto por teste (isolamento de sessão/localStorage).
    Create Evidence Directories
    Set Browser Timeout    ${DEFAULT_TIMEOUT}
    New Browser    ${BROWSER_CHANNEL}    headless=${HEADLESS}
    New Context    viewport={"width": ${VIEWPORT_WIDTH}, "height": ${VIEWPORT_HEIGHT}}    acceptDownloads=${True}
    New Page    about:blank
    Enable Console And Network Monitors

Teardown Browser Test
    Run Keyword If Test Failed    Capture Failure Evidence
    Save Console Log To Evidence    test_teardown
    Close Browser

Create Evidence Directories
    Create Directory    ${RESULTS_DIR}
    Create Directory    ${EVIDENCE_DIR}
    Create Directory    ${SCREENSHOT_DIR}
    Create Directory    ${LOG_DIR}

Enable Console And Network Monitors
    Evaluate JavaScript    () => { window.__exeqRobot = { consoleErrors: [], failedRequests: [] }; const push = (type, msg) => window.__exeqRobot.consoleErrors.push({ type, msg }); window.addEventListener('error', e => push('error', e.message || String(e))); window.addEventListener('unhandledrejection', e => push('unhandledrejection', String(e.reason))); }

Wait For Page Settled
    [Documentation]    Espera rede idle — sem sleep fixo.
    Wait For Load State    networkidle    timeout=${NAVIGATION_TIMEOUT}

Go To Admin Path
    [Arguments]    ${path}
    Go To    ${ADMIN_BASE_URL}${path}
    Wait For Page Settled
