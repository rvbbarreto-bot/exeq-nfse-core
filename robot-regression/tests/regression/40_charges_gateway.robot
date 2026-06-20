*** Settings ***
Documentation    Regressão — cobranças, gateway mock, sandbox link, vínculo emissão.
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Resource         ../../pages/charges_page.robot
Resource         ../../variables/selectors.robot
Library          Browser
Resource         ../../pages/issue_detail_page.robot
Resource         ../../keywords/api_helpers.robot
Resource         ../../resources/network_console.robot
Suite Setup      Begin Suite With Shared Browser
Suite Teardown   End Suite With Shared Browser

*** Test Cases ***
REG-CHG-01 Lista Cobrancas Com Tabela
    [Tags]    regression    charges
    Login As Valid Operator
    Click Nav Charges
    Charges List Should Be Visible

REG-CHG-02 Detalhe Cobranca Registrada Gateway Mock
    [Tags]    regression    charges    gateway
    ${token}=    Api Login
    ${charge}=    Api Create Registered Charge    ${token}
    Login As Valid Operator
    Open Charge Detail By Id    ${charge}[id]
    Charge Detail Should Show Status    Registrada
    Charge Gateway Block Should Be Visible
    ${mode}=    Get Text    ${SEL_CHARGE_GATEWAY_MODE}
    Should Contain    ${mode}    Mock
    Sandbox Link Should Be Visible In Homolog
    Console Should Have No Errors

REG-CHG-03 Criar Cobranca Vinculada Na Emissao
    [Tags]    regression    charges    issues
    ${token}=    Api Login
    ${issue}=    Api Create Authorized Pilot Issue    ${token}
    Login As Valid Operator
    Open Issue Detail By Id    ${issue}[issue_id]
    Create Charge From Issue Should Open Charge Detail
    Console Should Have No Errors
