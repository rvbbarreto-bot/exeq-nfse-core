*** Settings ***
Library          Browser
Resource         ../resources/browser_setup.robot
Resource         ../variables/selectors.robot
Resource         ../config/environment.robot

*** Keywords ***
Login Page Open
    Go To Admin Path    ${LOGIN_PATH}
    Wait For Elements State    ${SEL_LOGIN_EMAIL}    visible

Fill Login Credentials
    [Arguments]    ${email}    ${password}
    Fill Text    ${SEL_LOGIN_EMAIL}    ${email}
    Fill Text    ${SEL_LOGIN_PASSWORD}    ${password}

Fill Valid Credentials
    Fill Login Credentials    ${LOGIN_EMAIL}    ${LOGIN_PASSWORD}

Submit Login
    Click    ${SEL_LOGIN_SUBMIT}
    Wait For Page Settled

Login Error Should Be Visible
    Wait For Elements State    ${SEL_LOGIN_ERROR}    visible    timeout=10s
    ${msg}=    Get Text    ${SEL_LOGIN_ERROR}
    Should Contain    ${msg}    Falha no login

Click Logout
    Click    ${SEL_LOGOUT_BUTTON}
    Wait For Page Settled
