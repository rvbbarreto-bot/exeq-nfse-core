*** Settings ***
Resource         ../pages/dashboard_page.robot
Resource         ../pages/issues_page.robot
Resource         ../pages/charges_page.robot
Resource         ../pages/webhooks_page.robot
Resource         ../pages/catalogs_page.robot
Resource         ../resources/browser_setup.robot
Resource         ../resources/evidence.robot

*** Keywords ***
Navigate All Primary Modules From Nav
    [Documentation]    Percorre menu principal e valida heading/página.
    Click Nav Dashboard
    Dashboard Should Be Visible
    Capture Checkpoint Screenshot    nav_dashboard
    Click Nav Issues
    Issues List Should Be Visible
    Capture Checkpoint Screenshot    nav_issues
    Click Nav Charges
    Charges List Should Be Visible
    Capture Checkpoint Screenshot    nav_charges
    Click Nav Webhooks
    Webhooks Inbox Should Be Visible
    Capture Checkpoint Screenshot    nav_webhooks
    Click Nav Catalogs
    Catalogs List Should Be Visible
    Capture Checkpoint Screenshot    nav_catalogs

Brand Link Should Return Dashboard
    Click Nav Issues
    Issues List Should Be Visible
    Click Brand Home
    Dashboard Should Be Visible
