*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot

*** Keywords ***
Dashboard Should Be Visible
    Wait For Elements State    ${SEL_PAGE_DASHBOARD}    visible
    Wait For Elements State    ${SEL_HEADING_DASHBOARD}    visible

Click Nav Dashboard
    Click    ${SEL_NAV_DASHBOARD}
    Wait For Page Settled

Click Brand Home
    Click    css=header.topbar a.brand
    Wait For Page Settled

Hypercare Section Should Be Visible
    Wait For Elements State    ${SEL_DASHBOARD_HYPERCARE}    visible

Gateway Badge Should Be Visible
    Wait For Elements State    ${SEL_GATEWAY_BADGE}    visible

Dashboard Should Not Show Loading Error
    ${count}=    Get Element Count    ${SEL_PAGE_ERROR_BANNER}
    Should Be Equal As Integers    ${count}    0
