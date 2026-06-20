*** Settings ***
Documentation    Validação de console JS e respostas HTTP críticas.
Library          Browser
Library          Collections
Resource         ../config/environment.robot
Resource         evidence.robot
Resource         ../keywords/api_helpers.robot

*** Keywords ***
Console Should Have No Errors
    ${browser_log}=    Get Console Log
    ${page_errors}=    Evaluate JavaScript    () => (window.__exeqRobot?.consoleErrors || []).map(e => e.type + ': ' + e.msg).join('\\n')
    Should Be Empty    ${page_errors}    msg=Erros JS na página:\n${page_errors}
    Should Not Contain    ${browser_log}    TypeError    ignore_case=True
    Should Not Contain    ${browser_log}    ReferenceError    ignore_case=True

Failed Network Requests Should Be Empty
    ${failed}=    Evaluate JavaScript    () => JSON.stringify(window.__exeqRobot?.failedRequests || [])
    Should Be Equal As Strings    ${failed}    []

Assert Api Health Ok
    ${resp}=    Api Get Json    /health
    Should Be Equal As Integers    ${resp}[status]    200
    Should Be Equal As Strings    ${resp}[body][status]    ok

Assert Api Login Returns Token
    ${token}=    Api Login
    Should Not Be Empty    ${token}
    RETURN    ${token}

Assert Pilot Municipios Stats Api
    ${token}=    Api Login
    ${resp}=    Api Get Json    /v1/nf/issues/stats    ${token}
    Should Be Equal As Integers    ${resp}[status]    200
    ${codes}=    Evaluate    sorted([m["ibge_code"] for m in $resp["body"]["pilot_municipios"]])    resp=${resp}
    ${expected}=    Create List    3504107    3507605    3528502    3547809
    Lists Should Be Equal    ${codes}    ${expected}

Monitor Page Api Calls For Failures
    Failed Network Requests Should Be Empty
