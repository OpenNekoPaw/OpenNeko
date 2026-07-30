## ADDED Requirements

### Requirement: Assistant responses use document flow
The Agent conversation Webview SHALL render assistant Markdown as a full-width document flow without an assistant speech-bubble surface, while user messages SHALL remain visually distinct as compact prompt bubbles or blocks.

#### Scenario: Long assistant response
- **WHEN** an assistant message contains a long Markdown response
- **THEN** the response uses the available conversation width without assistant bubble background, border, or rounded bubble corners
- **AND** headings, lists, code, tables, media, and resource references retain their existing semantic renderers

#### Scenario: User prompt remains distinguishable
- **WHEN** a user message is rendered next to assistant document content
- **THEN** the user message remains compact, right-aligned, and identifiable without relying only on color

### Requirement: One assistant identity anchors a message document
The Webview SHALL use the canonical owner message identity to visually connect content blocks from the same assistant message without rendering each block as an independent chat message.

#### Scenario: Multi-block assistant message
- **WHEN** one assistant message projects thinking, Tool, Markdown, and artifact blocks
- **THEN** the first visible block shows the assistant identity once
- **AND** subsequent blocks share a consistent document alignment and preserve chronological ordering
- **AND** every virtual list item retains the original owner message identity

### Requirement: Process records are compact by default
The Webview SHALL collapse completed thinking and successful output-free Tool records into a keyboard-accessible process summary, while actionable execution states remain visibly expanded as semantic cards.

#### Scenario: Completed process before final answer
- **WHEN** completed thinking and successful output-free Tools precede an assistant answer
- **THEN** they appear as a collapsed process summary with step and Tool counts
- **AND** the user can expand or collapse the summary with a button exposing `aria-expanded`

#### Scenario: Actionable Tool state
- **WHEN** a Tool is running, awaiting approval, failed, or exposes creator-visible output
- **THEN** the Tool remains visible as its owning semantic status or result card
- **AND** it is not hidden inside a completed-process summary

### Requirement: Unanchored work-item shelf represents attention only
The conversation work-item shelf SHALL display only unanchored work items whose canonical status is queued, processing, or failed.

#### Scenario: Active unanchored Subagent
- **WHEN** a Subagent work item is not referenced by any message and its status is queued or processing
- **THEN** it appears once in the conversation attention shelf

#### Scenario: Anchored or terminal Subagent
- **WHEN** a Subagent work item is referenced by a message or its unanchored status is completed or cancelled
- **THEN** it does not appear in the conversation attention shelf
- **AND** the Webview does not synthesize a second task or history fact

### Requirement: Creator-visible outputs have a structured result section
The Webview SHALL label Tool-owned creator-visible attachments, artifact transfers, openable file results, and generated media as produced outputs using only their structured Tool result projection.

#### Scenario: Structured Tool outputs
- **WHEN** a successful Tool result contains a stable attachment, artifact transfer, generated media projection, or openable file result
- **THEN** the Tool display presents a localized produced-output heading and the existing output renderer or open action
- **AND** each output retains its Tool identity and stable resource navigation path

#### Scenario: Markdown mentions a filename
- **WHEN** assistant Markdown mentions a filename but no structured Tool output exists
- **THEN** the Webview does not create a produced-output item from that text

### Requirement: Document timeline preserves virtualized conversation behavior
The document timeline SHALL preserve canonical item order, stable owner identities, follow-tail streaming, detached viewport restoration, and measured virtual-list layout.

#### Scenario: Streamed document growth
- **WHEN** the active assistant Markdown block grows while the viewport follows the tail
- **THEN** the virtual list remeasures the block and continues following the canonical streaming item

#### Scenario: Restored detached viewport
- **WHEN** a conversation is reactivated with a detached viewport anchored to a message
- **THEN** restoration resolves the first virtual item with the same owner message identity
- **AND** no new presentation-only message identity is introduced
