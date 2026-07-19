## ADDED Requirements

### Requirement: Asset generation selection remains tabless until confirmation

The Agent Webview SHALL keep the asset-generation picker in the tabless entry composer until the user explicitly selects an available generation mode. Opening or closing the picker MUST NOT create a conversation or Tab.

#### Scenario: Open the asset-generation picker

- **WHEN** the user activates Generate Assets from the Agent entry page
- **THEN** the entry page displays the asset-generation picker and no conversation or Tab is created

#### Scenario: Exit without selecting a generation mode

- **WHEN** the user closes the asset-generation picker without selecting image, video, or audio
- **THEN** the picker closes, the entry draft remains available, and no conversation or Tab is created

#### Scenario: Send while asset generation intent is awaiting a mode

- **WHEN** the entry intent is Generate Assets and the user submits a non-empty draft without confirming a generation mode
- **THEN** the Webview reopens the asset-generation picker and MUST NOT create a conversation or Tab

### Requirement: Generation mode confirmation initializes exactly one Tab

The Agent Webview SHALL create exactly one ordinary conversation Tab after the user selects an available asset-generation mode. The new Tab MUST receive the selected session mode and any non-empty entry draft through explicit one-time initialization projections.

#### Scenario: Select an asset-generation mode

- **WHEN** the user selects image, video, or audio from the tabless asset-generation picker
- **THEN** the Webview creates exactly one conversation Tab and closes the tabless picker

#### Scenario: Transfer mode and draft to the new Tab

- **WHEN** the new conversation Tab becomes active after an asset-generation mode is selected
- **THEN** the Tab applies that mode, projects the corresponding media-model default, restores the entry draft as unsent input, and consumes each initialization request exactly once
