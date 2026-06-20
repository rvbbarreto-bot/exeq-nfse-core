*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot

*** Keywords ***
Click Nav Charges
    Click    ${SEL_NAV_CHARGES}
    Wait For Page Settled

Charges List Should Be Visible
    Wait For Elements State    ${SEL_PAGE_CHARGES}    visible
    Wait For Elements State    ${SEL_TABLE}    visible

Open Charge Detail By Id
    [Arguments]    ${charge_id}
    Go To Admin Path    /charges/${charge_id}
    Wait For Page Settled
    Wait For Elements State    ${SEL_PAGE_CHARGE_DETAIL}    visible

Charge Detail Should Show Status
    [Arguments]    ${status_text}
    ${body}=    Get Text    css=[data-testid="page-charge-detail"]
    Should Contain    ${body}    ${status_text}

Charge Gateway Block Should Be Visible
    Wait For Elements State    ${SEL_CHARGE_GATEWAY}    visible
    Wait For Elements State    ${SEL_CHARGE_GATEWAY_MODE}    visible

Sandbox Link Should Be Visible In Homolog
    Wait For Elements State    ${SEL_CHARGE_SANDBOX_LINK}    visible
