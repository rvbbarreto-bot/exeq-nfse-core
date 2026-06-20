*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot
Resource         charges_page.robot

*** Keywords ***
Open Issue Detail By Id
    [Arguments]    ${issue_id}
    Go To Admin Path    /issues/${issue_id}
    Wait For Page Settled
    Wait For Elements State    ${SEL_PAGE_ISSUE_DETAIL}    visible

Issue Detail Should Show Municipio
    [Arguments]    ${municipio_label}
    ${txt}=    Get Text    ${SEL_ISSUE_MUNICIPIO}
    Should Contain    ${txt}    ${municipio_label}

Issue Should Show Authorized Status
    ${status}=    Get Text    css=[data-testid="page-issue-detail"] span.pill >> nth=0
    Should Be Equal As Strings    ${status}    Autorizada

Create Charge From Issue Should Open Charge Detail
    Wait For Elements State    ${SEL_ISSUE_CREATE_CHARGE_FORM}    visible
    Click    ${SEL_ISSUE_CREATE_CHARGE}
    Wait For Elements State    ${SEL_PAGE_CHARGE_DETAIL}    visible    timeout=20s
    Charge Detail Should Show Status    Registrada
