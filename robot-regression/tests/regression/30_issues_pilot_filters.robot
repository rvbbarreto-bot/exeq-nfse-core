*** Settings ***
Documentation    Regressão — emissões NFS-e, filtro 4 municípios piloto, exclusão Barueri.
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Resource         ../../pages/issues_page.robot
Resource         ../../pages/issue_detail_page.robot
Resource         ../../keywords/api_helpers.robot
Resource         ../../resources/network_console.robot
Suite Setup      Begin Suite With Shared Browser
Suite Teardown   End Suite With Shared Browser

*** Test Cases ***
REG-ISS-01 Filtro Municipio Quatro Pilotos
    [Tags]    regression    issues    pilot
    Login As Valid Operator
    Click Nav Issues
    Pilot Municipio Filter Should Have Four Options
    Barueri Should Not Appear In Municipio Filter

REG-ISS-02 Detalhe Emissao Atibaia Autorizada
    [Tags]    regression    issues    api-assisted
    ${token}=    Api Login
    ${issue}=    Api Create Authorized Pilot Issue    ${token}    3504107    Atibaia
    Login As Valid Operator
    Open Issue Detail By Id    ${issue}[issue_id]
    Issue Should Show Authorized Status
    Issue Detail Should Show Municipio    Atibaia
    Console Should Have No Errors

REG-ISS-03 Detalhe Emissao Santo Andre
    [Tags]    regression    issues    sprint15
    ${token}=    Api Login
    ${issue}=    Api Create Authorized Pilot Issue    ${token}    3547809    Santo André
    Login As Valid Operator
    Open Issue Detail By Id    ${issue}[issue_id]
    Issue Detail Should Show Municipio    Santo André
    Console Should Have No Errors

REG-ISS-04 Tax Resolve API Santo Andre
    [Tags]    regression    api    sprint15
    ${token}=    Api Login
    Api Tax Resolve For Ibge    ${token}    3547809    0.02
