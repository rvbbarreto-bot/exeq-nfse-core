*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot
Resource         ../config/environment.robot

*** Keywords ***
Click Nav Issues
    Click    ${SEL_NAV_ISSUES}
    Wait For Page Settled

Issues List Should Be Visible
    Wait For Elements State    ${SEL_PAGE_ISSUES}    visible
    Wait For Elements State    ${SEL_TABLE}    visible

Pilot Municipio Filter Should Have Four Options
    Wait For Elements State    ${SEL_FILTER_MUNICIPIO}    visible
    FOR    ${label}    IN    @{PILOT_MUNICIPIO_LABELS}
        ${n}=    Get Element Count    ${SEL_FILTER_MUNICIPIO} >> option >> text=${label}
        Should Be Equal As Integers    ${n}    1
    END
    ${option_count}=    Get Element Count    ${SEL_FILTER_MUNICIPIO} >> option
    Should Be Equal As Integers    ${option_count}    5

Barueri Should Not Appear In Municipio Filter
    ${n}=    Get Element Count    ${SEL_FILTER_MUNICIPIO} >> option >> text=Barueri
    Should Be Equal As Integers    ${n}    0

Apply Municipio Filter
    [Arguments]    ${ibge_code}
    Select Options By    ${SEL_FILTER_MUNICIPIO}    value    ${ibge_code}
    Click    css=[data-testid="page-issues"] button >> text=Aplicar filtros
    Wait For Page Settled

Click First Issue Open Link If Present
    ${links}=    Get Element Count    css=[data-testid="page-issues"] table tbody a >> text=Abrir
    IF    ${links} > 0
        Click    css=[data-testid="page-issues"] table tbody a >> text=Abrir >> nth=0
        Wait For Page Settled
    END
