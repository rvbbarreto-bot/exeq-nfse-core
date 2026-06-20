*** Settings ***
Documentation    Smoke — fluxos mínimos para gate rápido (login, nav, API health).
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Resource         ../../keywords/navigation_keywords.robot
Resource         ../../pages/dashboard_page.robot
Resource         ../../resources/network_console.robot
Suite Setup      Begin Suite With Shared Browser
Suite Teardown   End Suite With Shared Browser
Test Setup       Begin Test Evidence
Test Teardown    End Test Evidence

*** Test Cases ***
SMOKE-01 API Health Retorna OK
    [Tags]    smoke    api
    Assert Api Health Ok

SMOKE-02 Login E Dashboard Carregam
    [Tags]    smoke    auth
    Login As Valid Operator
    Dashboard Should Not Show Loading Error
    Console Should Have No Errors

SMOKE-03 Navegacao Menu Principal
    [Tags]    smoke    navigation
    Login As Valid Operator
    Navigate All Primary Modules From Nav
    Console Should Have No Errors

SMOKE-04 API Stats Quatro Municipios Piloto
    [Tags]    smoke    api    pilot
    Assert Pilot Municipios Stats Api
