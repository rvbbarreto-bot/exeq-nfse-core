*** Variables ***
# Login
${SEL_LOGIN_EMAIL}              css=[data-testid="login-email"]
${SEL_LOGIN_PASSWORD}           css=[data-testid="login-password"]
${SEL_LOGIN_SUBMIT}             css=[data-testid="login-submit"]
${SEL_LOGIN_ERROR}              css=form.card p.error

# Navegação
${SEL_NAV_DASHBOARD}            css=[data-testid="nav-dashboard"]
${SEL_NAV_ISSUES}               css=[data-testid="nav-issues"]
${SEL_NAV_CHARGES}              css=[data-testid="nav-charges"]
${SEL_NAV_WEBHOOKS}             css=[data-testid="nav-webhooks"]
${SEL_NAV_CATALOGS}             css=[data-testid="nav-catalogs"]
${SEL_LOGOUT_BUTTON}            css=header.topbar >> text=Sair

# Páginas
${SEL_PAGE_DASHBOARD}           css=[data-testid="page-dashboard"]
${SEL_PAGE_ISSUES}              css=[data-testid="page-issues"]
${SEL_PAGE_CHARGES}             css=[data-testid="page-charges"]
${SEL_PAGE_CHARGE_DETAIL}       css=[data-testid="page-charge-detail"]
${SEL_PAGE_ISSUE_DETAIL}        css=[data-testid="page-issue-detail"]
${SEL_FILTER_MUNICIPIO}         css=[data-testid="filter-municipio"]
${SEL_DASHBOARD_HYPERCARE}      css=[data-testid="dashboard-hypercare"]
${SEL_GATEWAY_BADGE}            css=[data-testid="gateway-integration-badge"]
${SEL_CHARGE_GATEWAY}           css=[data-testid="charge-gateway"]
${SEL_CHARGE_GATEWAY_MODE}      css=[data-testid="charge-gateway-mode"]
${SEL_CHARGE_SANDBOX_LINK}      css=[data-testid="charge-gateway-sandbox-link"]
${SEL_ISSUE_MUNICIPIO}          css=[data-testid="issue-municipio"]
${SEL_ISSUE_CREATE_CHARGE}      css=[data-testid="issue-create-charge"]
${SEL_ISSUE_CREATE_CHARGE_FORM}    css=[data-testid="issue-create-charge-form"]

# Headings (páginas sem data-testid no main)
${SEL_HEADING_WEBHOOKS}         css=h1 >> text=Webhooks (inbox)
${SEL_HEADING_CATALOGS}         css=h1 >> text=Catalogos fiscais
${SEL_HEADING_DASHBOARD}        css=h1 >> text=Dashboard operacao

# Tabelas genéricas
${SEL_TABLE}                    css=table.table
${SEL_PAGE_ERROR_BANNER}        css=main.page >> css=p.error
