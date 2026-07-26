## ADDED Requirements

### Requirement: Header exposes a distinct role session entry
The Agent Header SHALL expose an icon-only role session action adjacent to ordinary new chat and history.
The action MUST have a localized accessible name and tooltip, and MUST NOT be represented as an ordinary
conversation or media session mode.

#### Scenario: User opens the role session menu
- **WHEN** the user activates the Header role session action from an ordinary Agent tab or the tabless entry
- **THEN** the Webview opens the role selector without creating, mutating or cancelling an ordinary conversation

#### Scenario: Header is displayed in a narrow sidebar
- **WHEN** the Agent panel width is constrained
- **THEN** new chat, role session and history retain stable icon-button dimensions without overlapping the tab labels or account action

### Requirement: Header role selector uses canonical character projections
Opening the Header role selector SHALL request the existing roleplay-scoped Project Search and SHALL list
only playable confirmed character Entities or explicitly confirmable character Candidates. Header and
tabless entry SHALL share the same roleplay eligibility and Candidate labeling semantics.

#### Scenario: Confirmed character results are available
- **WHEN** roleplay-scoped Project Search returns confirmed character Entities
- **THEN** the menu displays those Entities using their stable projected identity, label and optional thumbnail

#### Scenario: Confirmable Candidate is available
- **WHEN** roleplay-scoped Project Search returns a named character Candidate with stable Search identity
- **THEN** the menu labels it as requiring confirmation and does not present it as an already confirmed Entity

#### Scenario: No playable character is available
- **WHEN** the roleplay-scoped result contains no eligible confirmed Entity or confirmable Candidate
- **THEN** the menu displays the localized roleplay empty state and does not synthesize a character from labels or active state

### Requirement: Role selection preserves the canonical Chara handoff
Selecting a Header role item MUST use the same existing Webview-to-Host action as the tabless roleplay
entry. Confirmed Entities SHALL start Character Dialogue with exact Entity identity; Candidates SHALL use
explicit confirmation with exact Project Search item identity. The Webview MUST NOT create a Chara session,
ordinary conversation or fallback identity itself.

#### Scenario: User selects a confirmed character Entity
- **WHEN** the user selects a confirmed character from the Header role selector
- **THEN** the Webview invokes the existing Character Dialogue start message with the exact Entity identity and the Host creates the Chara-owned role session

#### Scenario: User selects a confirmable Candidate
- **WHEN** the user selects a Candidate from the Header role selector
- **THEN** the Webview invokes the existing explicit Candidate confirmation message with its stable Project Search item identity and creates no optimistic role tab

#### Scenario: Host rejects stale identity
- **WHEN** the selected Entity or Candidate identity is stale, missing or no longer eligible
- **THEN** the existing Host path fails visibly and the Webview does not fall back to its label, active Entity, ordinary conversation or another workspace

### Requirement: Role selector has complete menu interaction semantics
The Header role selector SHALL expose menu state through `aria-haspopup` and `aria-expanded`, indicate its
active state while open, and close on selection, outside click or Escape without starting a session when no
item was selected.

#### Scenario: User dismisses the menu
- **WHEN** the user presses Escape or clicks outside the open role selector
- **THEN** the menu closes, focus remains in the Agent surface and no role or ordinary conversation is created
