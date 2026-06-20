*** Settings ***
Documentation    Regressão — webhooks inbox, catálogos fiscais, filtros e tabelas.
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Resource         ../../pages/webhooks_page.robot
Resource         ../../pages/catalogs_page.robot
Resource         ../../resources/network_console.robot
Suite Setup      Begin Suite With Shared Browser
Suite Teardown   End Suite With Shared Browser

*** Test Cases ***
REG-WH-01 Webhooks Inbox Carrega
    [Tags]    regression    webhooks
    Login As Valid Operator
    Click Nav Webhooks
    Webhooks Inbox Should Be Visible
    Webhooks Filter Apply Should Work
    Console Should Have No Errors

REG-CAT-01 Catalogos Lista Carrega
    [Tags]    regression    catalogs
    Login As Valid Operator
    Click Nav Catalogs
    Catalogs List Should Be Visible
    Open First Catalog If Present
    Console Should Have No Errors
