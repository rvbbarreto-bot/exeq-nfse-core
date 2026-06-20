*** Settings ***
Documentation    Regressão profunda — console, API auth, redirects, páginas críticas.
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Resource         ../../keywords/navigation_keywords.robot
Resource         ../../resources/network_console.robot
Resource         ../../resources/browser_setup.robot
Resource         ../../pages/login_page.robot
Resource         ../../pages/dashboard_page.robot
Test Setup       Begin Test With Isolated Browser
Test Teardown    End Test With Isolated Browser

*** Test Cases ***
REG-DEEP-01 Login API E UI Sem Erros Console
    [Tags]    regression    deep    console
    Assert Api Login Returns Token
    Login As Valid Operator
    Console Should Have No Errors

REG-DEEP-02 Redirect Raiz Deslogado Para Login
    [Tags]    regression    deep    security
    Go To Admin Path    /
    Login Page Open
    ${url}=    Get Url
    Should Contain    ${url}    /login

REG-DEEP-03 Wildcard Route Volta Dashboard Logado
    [Tags]    regression    deep    routing
    Login As Valid Operator
    Go To Admin Path    /rota-inexistente-robot
    Wait For Page Settled
    Dashboard Should Be Visible

REG-DEEP-04 Navegacao Completa Sem Falhas Rede Registradas
    [Tags]    regression    deep    network
    Login As Valid Operator
    Navigate All Primary Modules From Nav
    Failed Network Requests Should Be Empty
    Console Should Have No Errors
