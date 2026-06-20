*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot

*** Keywords ***
Click Nav Catalogs
    Click    ${SEL_NAV_CATALOGS}
    Wait For Page Settled

Catalogs List Should Be Visible
    Wait For Elements State    ${SEL_HEADING_CATALOGS}    visible
    Wait For Elements State    ${SEL_TABLE}    visible

Open First Catalog If Present
    ${count}=    Get Element Count    css=main.page table tbody a >> text=Abrir
    IF    ${count} > 0
        Click    css=main.page table tbody a >> text=Abrir >> nth=0
        Wait For Page Settled
    END
