*** Settings ***
Documentation    Regressão — autenticação, sessão, logout e rotas protegidas.
Resource         ../../resources/suite_setup.robot
Resource         ../../keywords/auth_keywords.robot
Test Setup       Begin Test With Isolated Browser
Test Teardown    End Test With Isolated Browser

*** Test Cases ***
REG-AUTH-01 Login Invalido Exibe Erro
    [Tags]    regression    auth
    Login With Invalid Password Should Fail

REG-AUTH-02 Sessao Persiste Apos Reload
    [Tags]    regression    auth    session
    Session Should Persist After Reload

REG-AUTH-03 Logout Redireciona Para Login
    [Tags]    regression    auth    logout
    Logout Should Redirect To Login

REG-AUTH-04 Rota Protegida Sem Token Redireciona Login
    [Tags]    regression    auth    security
    Protected Route Without Session Redirects To Login
