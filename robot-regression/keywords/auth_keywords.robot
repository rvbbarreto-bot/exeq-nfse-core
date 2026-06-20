*** Settings ***
Library          Browser
Resource         ../pages/login_page.robot
Resource         ../pages/dashboard_page.robot
Resource         ../resources/browser_setup.robot
Resource         ../resources/evidence.robot

*** Keywords ***
Login As Valid Operator
    [Documentation]    Fluxo feliz login → dashboard.
    Login Page Open
    Fill Valid Credentials
    Submit Login
    Dashboard Should Be Visible
    Capture Checkpoint Screenshot    login_dashboard_ok

Login With Invalid Password Should Fail
    Login Page Open
    Fill Login Credentials    ${LOGIN_EMAIL}    wrong-password-robot
    Submit Login
    Login Error Should Be Visible
    Capture Checkpoint Screenshot    login_error_invalid_password

Logout Should Redirect To Login
    Login As Valid Operator
    Click Logout
    Login Page Open
    Capture Checkpoint Screenshot    logout_redirect_login

Session Should Persist After Reload
    Login As Valid Operator
    reload
    Wait For Page Settled
    Dashboard Should Be Visible
    Capture Checkpoint Screenshot    session_persist_reload

Protected Route Without Session Redirects To Login
    Go To Admin Path    /issues
    Login Page Open
