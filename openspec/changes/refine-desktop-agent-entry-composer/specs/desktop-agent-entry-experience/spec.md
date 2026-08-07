## ADDED Requirements

### Requirement: Desktop Agent entry is a centered creation surface

The Desktop Agent tabless entry SHALL present its prompt information and package-owned Composer as one vertically centered, bounded creation surface. The prompt and Composer SHALL share one readable alignment axis, and the surface MUST remain scrollable without clipping at supported compact window sizes.

#### Scenario: User opens the Desktop Agent entry

- **WHEN** Desktop displays a tabless Agent draft with no active Conversation
- **THEN** the prompt information appears immediately above the Composer in one centered stack
- **AND** the Desktop prompt presentation does not render a separate card boundary or Skill shortcut chips

#### Scenario: Entry is displayed in a compact window

- **WHEN** the centered prompt and Composer cannot fit within the available height
- **THEN** the entry surface remains vertically scrollable with safe top and bottom spacing
- **AND** prompt text, toolbar controls, menus and send action remain reachable without overlap or clipping

### Requirement: Composer opens exactly one Project from one bottom control

The Agent Composer SHALL expose Project context from a single bottom-toolbar control. In an Assistant entry the control SHALL be named “Open Project” and SHALL offer the available registered Project catalog plus one system-directory action. Selecting an item MUST navigate through the exact canonical Desktop Scene action and MUST NOT create retained multi-Project selection state, expose a raw path or add a second Workspace authority.

#### Scenario: User opens a registered Project

- **WHEN** the user selects one available registered Project from “Open Project”
- **THEN** Desktop issues `open-project-workspace` for that exact `projectId`
- **AND** the current entry is replaced by that Project's Workspace Scene without retaining another selected Project

#### Scenario: User opens a system directory

- **WHEN** the user selects the system-directory action and authorizes one directory
- **THEN** Desktop uses the existing Workspace grant authority and `open-workspace` Scene transition
- **AND** the Webview receives no raw directory path and no additional directory remains selected

#### Scenario: User cancels system directory selection

- **WHEN** the native directory chooser returns cancelled
- **THEN** the current Agent entry and its draft remain unchanged
- **AND** no successful Scene transition is reported

#### Scenario: Registered Project is unavailable

- **WHEN** an added Project carries an unavailable diagnostic
- **THEN** “Open Project” keeps that Project visible with its diagnostic and disables opening it
- **AND** valid sibling Projects and the system-directory action remain available

#### Scenario: Composer belongs to an opened Workspace

- **WHEN** the Composer is bound to one Workspace Project
- **THEN** its bottom toolbar shows the exact Project label as the single Workspace context
- **AND** no second active Project or multi-selection control is created

### Requirement: Desktop entry uses Agent-only Composer controls

The Desktop tabless entry SHALL use `agent` as its effective session mode for model projection and submission. Its visible Composer controls SHALL consist of attachment, Agent model configuration, Project opening and send actions; it SHALL NOT render session-mode selection, execution-mode selection, slash-command shortcut, Skill shortcut, usage indicator or media-call count. Existing Conversation Composers and typed command input SHALL retain their current behavior.

#### Scenario: Desktop entry starts from a non-Agent draft default

- **WHEN** a Desktop tabless entry is reconstructed while its disposable entry mode state is not `agent`
- **THEN** the visible model configuration and submitted send input both use `agent`
- **AND** no media generation or alternative session mode is selected implicitly

#### Scenario: User inspects the entry toolbar

- **WHEN** the Desktop tabless entry is idle
- **THEN** the toolbar shows attachment, model configuration, Open Project and send actions
- **AND** it does not show Agent/session mode, execution mode, `/`, `$`, usage or media-call controls

#### Scenario: User types a message at the entry

- **WHEN** the user enters and submits a message from the Desktop tabless entry
- **THEN** the message starts or submits through the existing Agent draft/conversation path with `sessionMode: agent`
- **AND** the placeholder does not advertise slash or Skill shortcut glyphs

#### Scenario: User opens an existing Conversation

- **WHEN** Desktop renders a persisted Conversation Composer instead of the tabless entry
- **THEN** its authoritative session and execution controls continue to follow that Conversation's current projection
- **AND** this entry presentation does not remove typed `/`, `$` or `@` capability from the Composer
