*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot

*** Keywords ***
Click Nav Webhooks
    Click    ${SEL_NAV_WEBHOOKS}
    Wait For Page Settled

Webhooks Inbox Should Be Visible
    Wait For Elements State    ${SEL_HEADING_WEBHOOKS}    visible
    Wait For Elements State    ${SEL_TABLE}    visible

Webhooks Filter Apply Should Work
    Click    css=main.page button >> text=Aplicar filtro
    Wait For Page Settled
    Wait For Elements State    ${SEL_TABLE}    visible
