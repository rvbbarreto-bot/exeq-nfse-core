*** Settings ***
Documentation    API helpers via fetch no contexto do browser (Playwright) — sem Requests/Selenium.
Library          Browser
Library          Collections
Library          BuiltIn
Resource         ../config/environment.robot
Resource         ../variables/selectors.robot
Resource         ../resources/evidence.robot

*** Keywords ***
Ensure Api Fetch Page Context
    Go To    ${ADMIN_BASE_URL}${LOGIN_PATH}
    Wait For Load State    networkidle    timeout=${NAVIGATION_TIMEOUT}
    Wait For Elements State    ${SEL_LOGIN_EMAIL}    visible

Api Post Json
    [Arguments]    ${path}    ${payload}    ${token}=${None}
    Ensure Api Fetch Page Context
    ${headers_str}=    Set Variable    {"Content-Type":"application/json"}
    IF    '${token}' != '${None}'
        ${headers_str}=    Set Variable    {"Content-Type":"application/json","Authorization":"Bearer ${token}"}
    END
    ${payload_str}=    Set Variable    ${payload}
    ${result}=    Evaluate JavaScript
    ...    async (url, headersJson, bodyJson) => {
    ...      const r = await fetch(url, { method: 'POST', headers: JSON.parse(headersJson), body: bodyJson });
    ...      let body = {};
    ...      try { body = await r.json(); } catch (e) { body = { _error: String(e) }; }
    ...      return { status: r.status, body };
    ...    }
    ...    ARGUMENTS    ${API_BASE_URL}${path}    ${headers_str}    ${payload_str}
    RETURN    ${result}

Api Get Json
    [Arguments]    ${path}    ${token}=${None}
    Ensure Api Fetch Page Context
    ${headers_str}=    Set Variable    {"Content-Type":"application/json"}
    IF    '${token}' != '${None}'
        ${headers_str}=    Set Variable    {"Content-Type":"application/json","Authorization":"Bearer ${token}"}
    END
    ${result}=    Evaluate JavaScript
    ...    async (url, headersJson) => {
    ...      const r = await fetch(url, { method: 'GET', headers: JSON.parse(headersJson) });
    ...      let body = {};
    ...      try { body = await r.json(); } catch (e) { body = { _error: String(e) }; }
    ...      return { status: r.status, body };
    ...    }
    ...    ARGUMENTS    ${API_BASE_URL}${path}    ${headers_str}
    RETURN    ${result}

Api Login
    ${resp}=    Api Post Json    /v1/auth/login    {"email": "${LOGIN_EMAIL}", "password": "${LOGIN_PASSWORD}"}
    Should Be Equal As Integers    ${resp}[status]    200
    RETURN    ${resp}[body][access_token]

Api Ensure Emission Master Data
    [Arguments]    ${token}
    ${providers}=    Api Get Json    /v1/providers?limit=1    ${token}
    ${provider_id}=    Set Variable    ${providers}[body][items][0][id]
    ${customers}=    Api Get Json    /v1/customers?limit=1    ${token}
    ${cust_items}=    Set Variable    ${customers}[body][items]
    ${cust_len}=    Get Length    ${cust_items}
    IF    ${cust_len} > 0
        ${customer_id}=    Set Variable    ${cust_items}[0][id]
    ELSE
        ${c}=    Api Post Json    /v1/customers    {"document": "52998224725", "name": "Tomador Robot Regression"}    ${token}
        ${customer_id}=    Set Variable    ${c}[body][id]
    END
    ${services}=    Api Get Json    /v1/services    ${token}
    ${service_id}=    Set Variable    ${EMPTY}
    FOR    ${item}    IN    @{services}[body][items]
        IF    '${item}[service_code]' == '1.01'
            ${service_id}=    Set Variable    ${item}[id]
        END
    END
    IF    '${service_id}' == '${EMPTY}'
        ${s}=    Api Post Json    /v1/services    {"service_code": "1.01", "description": "Analise sistemas", "lc116_item": "1.01"}    ${token}
        ${service_id}=    Set Variable    ${s}[body][id]
    END
    RETURN    ${provider_id}    ${customer_id}    ${service_id}

Api Create Registered Charge
    [Arguments]    ${token}    ${amount_cents}=250000
    ${customers}=    Api Get Json    /v1/customers?limit=1    ${token}
    ${cid}=    Set Variable    ${customers}[body][items][0][id]
    ${idempotency}=    Evaluate    f"robot-reg-{int(__import__('time').time()*1000)}"
    ${resp}=    Api Post Json
    ...    /v1/charges
    ...    {"idempotency_key": "${idempotency}", "customer_id": "${cid}", "amount_cents": ${amount_cents}, "due_date": "2026-12-15", "description": "Robot regression charge"}
    ...    ${token}
    Should Be True    ${resp}[status] == 200 or ${resp}[status] == 201
    Should Be Equal As Strings    ${resp}[body][status]    registered
    RETURN    ${resp}[body]

Api Tax Resolve For Ibge
    [Arguments]    ${token}    ${ibge_code}    ${expected_iss_rate}=0.02
    ${resp}=    Api Post Json
    ...    /v1/tax/resolve
    ...    {"ibge_code": "${ibge_code}", "service_code": "1.01", "tax_regime": "simples_nacional", "competence_date": "2026-06-01", "fiscal_profile_name": "Perfil Piloto SP"}
    ...    ${token}
    Should Be Equal As Integers    ${resp}[status]    200
    Should Be Equal As Numbers    ${resp}[body][resolved][iss_rate]    ${expected_iss_rate}
    RETURN    ${resp}[body]

Api Create Authorized Pilot Issue
    [Arguments]    ${token}    ${ibge_code}=3504107    ${municipio_label}=Atibaia
    ${provider_id}    ${customer_id}    ${service_id}=    Api Ensure Emission Master Data    ${token}
    ${idempotency}=    Evaluate    f"robot-issue-{int(__import__('time').time()*1000)}"
    ${resp}=    Api Post Json
    ...    /v1/nf/issues
    ...    {"idempotency_key": "${idempotency}", "provider_id": "${provider_id}", "customer_id": "${customer_id}", "service_id": "${service_id}", "ibge_code": "${ibge_code}", "competence_date": "2026-06-01", "amount_cents": 150000, "description": "Emissao robot ${municipio_label}"}
    ...    ${token}
    Should Be True    ${resp}[status] == 200 or ${resp}[status] == 201
    Should Be Equal As Strings    ${resp}[body][status]    authorized
    RETURN    ${resp}[body]
