*** Settings ***
Documentation    Regressão — navegação, brand link, módulos sem erro de carregamento.
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Resource         ../../keywords/navigation_keywords.robot
Resource         ../../resources/network_console.robot
Suite Setup      Begin Suite With Shared Browser
Suite Teardown   End Suite With Shared Browser

*** Test Cases ***
REG-NAV-01 Percorrer Todos Modulos Menu
    [Tags]    regression    navigation
    Login As Valid Operator
    Navigate All Primary Modules From Nav
    Console Should Have No Errors

REG-NAV-02 Brand Link Volta Dashboard
    [Tags]    regression    navigation
    Login As Valid Operator
    Brand Link Should Return Dashboard

REG-NAV-03 Dashboard Hypercare E Gateway Badge
    [Tags]    regression    dashboard
    Login As Valid Operator
    Hypercare Section Should Be Visible
    Gateway Badge Should Be Visible
    Dashboard Should Not Show Loading Error
