*** Settings ***
Documentation    Setup compartilhado importado pelas suites de teste.
Resource         browser_setup.robot
Resource         evidence.robot

*** Keywords ***
Begin Suite With Shared Browser
    Setup Browser Suite

End Suite With Shared Browser
    Teardown Browser Suite

Begin Test With Isolated Browser
    Setup Browser Test

End Test With Isolated Browser
    Teardown Browser Test

Begin Test Evidence
    Capture Checkpoint Screenshot    test_start

End Test Evidence
    Run Keyword If Test Passed    Capture Checkpoint Screenshot    test_passed
