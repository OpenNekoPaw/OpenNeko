## ADDED Requirements

### Requirement: Transcript role hierarchy
The Agent Webview SHALL present user input, Agent output, execution activity, system notices, and errors with distinct low-decoration semantics inside one stable transcript rail.

#### Scenario: User input and Agent answer
- **WHEN** a user message and its Agent answer are visible
- **THEN** the user message is right-aligned in a compact neutral background container without a border
- **AND** the Agent answer is left-aligned as unframed document text
- **AND** existing avatar, role-name, timestamp, and message structure remain available

#### Scenario: Execution and system activity
- **WHEN** execution activity or a system notice is visible in the transcript
- **THEN** it is rendered as compact secondary text rather than a chat bubble competing with the answer

### Requirement: Inline fail-visible diagnostics
The Agent Webview SHALL render an Agent message marked as an error as a compact inline diagnostic that preserves its complete message, error severity, and accessible alert semantics without presenting it as a large bordered chat bubble.

#### Scenario: Agent request fails
- **WHEN** an Agent transcript message has `isError` set
- **THEN** the error icon, localized error label, and complete diagnostic text are visible inline
- **AND** the diagnostic exposes alert semantics
- **AND** valid sibling transcript messages remain usable

### Requirement: Visible message copy
The Agent Webview SHALL copy the canonical text represented by the visible message rather than an alternate or empty message field.

#### Scenario: Copy a structured Agent answer
- **WHEN** an Agent message renders its final answer from structured content blocks and the user activates Copy
- **THEN** the clipboard receives the visible final Markdown answer in display order
- **AND** hidden thinking, tool activity, timestamps, and action labels are excluded

#### Scenario: Copy a plain message
- **WHEN** the user activates Copy for a visible plain user, error, or Agent message
- **THEN** the clipboard receives that message's visible text

#### Scenario: No visible copyable text
- **WHEN** a transcript item contains no visible textual answer
- **THEN** the message-level Copy action is not offered

### Requirement: Copy outcome feedback
The Agent Webview SHALL expose a localized, observable outcome for each clipboard write attempt and SHALL NOT report success when the browser clipboard boundary rejects the operation. Desktop SHALL authorize only same-origin sanitized clipboard writes from its exact renderer WebContents and SHALL continue rejecting clipboard reads and unrelated permission requests.

#### Scenario: Clipboard write succeeds
- **WHEN** the browser clipboard accepts the visible message text
- **THEN** the Copy action temporarily exposes a copied state

#### Scenario: Desktop authorizes a sanitized write
- **WHEN** the exact Desktop renderer WebContents requests `clipboard-sanitized-write` from its configured origin
- **THEN** the Desktop permission boundary authorizes that request
- **AND** clipboard read, foreign origin, foreign WebContents, and unrelated permission requests remain denied

#### Scenario: Clipboard write fails
- **WHEN** the browser clipboard API is unavailable or rejects the write
- **THEN** the Copy action temporarily exposes a copy-failed state
- **AND** the transcript and other message actions remain usable
