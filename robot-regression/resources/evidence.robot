*** Settings ***
Documentation    Screenshots, checkpoints e logs para evidência QA.
Library          Browser
Library          DateTime
Library          OperatingSystem
Resource         ../config/environment.robot

*** Keywords ***
Capture Checkpoint Screenshot
    [Arguments]    ${checkpoint_name}
    ${stamp}=    Get Current Date    result_format=%Y%m%d_%H%M%S
    ${safe}=    Evaluate    """${checkpoint_name}""".replace(" ", "_").replace("/", "-")
    ${path}=    Set Variable    ${EVIDENCE_DIR}${/}${safe}_${stamp}.png
    Take Screenshot    ${path}    fullPage=${True}
    Log To Console    [EVIDENCE] ${path}

Capture Failure Evidence
    ${stamp}=    Get Current Date    result_format=%Y%m%d_%H%M%S
    ${path}=    Set Variable    ${EVIDENCE_DIR}${/}FAILURE_${stamp}.png
    Take Screenshot    ${path}    fullPage=${True}
    Save Console Log To Evidence    failure_${stamp}
    Save Failed Network Log To Evidence    failure_${stamp}
    Log To Console    [FAILURE EVIDENCE] ${path}

Save Console Log To Evidence
    [Arguments]    ${prefix}
    ${logs}=    Get Console Log
    ${path}=    Set Variable    ${LOG_DIR}${/}${prefix}_console.log
    Create File    ${path}    ${logs}
    Log    Console log: ${path}

Save Failed Network Log To Evidence
    [Arguments]    ${prefix}
    ${failed}=    Evaluate JavaScript    () => (window.__exeqRobot && window.__exeqRobot.failedRequests) ? JSON.stringify(window.__exeqRobot.failedRequests, null, 2) : '[]'
    ${path}=    Set Variable    ${LOG_DIR}${/}${prefix}_network.json
    Create File    ${path}    ${failed}

Record Failed Api Response
    [Arguments]    ${url}    ${status}    ${body}
    Evaluate JavaScript    (u, s, b) => { window.__exeqRobot = window.__exeqRobot || { consoleErrors: [], failedRequests: [] }; window.__exeqRobot.failedRequests.push({ url: u, status: s, body: b }); }    ARGUMENTS    ${url}    ${status}    ${body}
