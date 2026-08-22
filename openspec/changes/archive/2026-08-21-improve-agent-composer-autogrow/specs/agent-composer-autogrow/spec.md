## ADDED Requirements

### Requirement: Bounded composer auto-growth
The Agent Webview SHALL keep the message composer compact for short drafts, grow the textarea with additional visible content, and stop growth at a responsive maximum that preserves surrounding transcript space.

#### Scenario: Short draft uses the default height
- **WHEN** the composer is empty or contains content that fits within its default height
- **THEN** the textarea remains at its compact default height
- **AND** no internal vertical scrollbar is active

#### Scenario: Draft grows within the available budget
- **WHEN** a draft requires more than the default textarea height but less than the responsive maximum
- **THEN** the textarea grows to reveal the draft content
- **AND** the composer controls remain in their existing layout

#### Scenario: Long draft reaches the maximum
- **WHEN** a draft requires more than the responsive maximum textarea height
- **THEN** the textarea stops growing at that maximum
- **AND** an internal themed vertical scrollbar provides access to the remaining content
- **AND** the surrounding transcript remains usable

### Requirement: Composer height recovery
The Agent Webview SHALL recompute composer height from the current controlled draft so that deleting, clearing, sending, pasting, and restoring content all use one canonical measurement path.

#### Scenario: Long draft is shortened
- **WHEN** the user deletes content from a previously overflowing draft
- **THEN** the textarea shrinks to the height required by the remaining content
- **AND** the internal scrollbar is removed when the content no longer overflows

#### Scenario: Draft is cleared
- **WHEN** the draft is cleared by sending, cancellation, or another owning controlled-state update
- **THEN** the textarea returns to its compact default height

#### Scenario: Long content is pasted or restored
- **WHEN** a long draft enters through paste or a controlled draft restoration
- **THEN** the same bounded auto-growth and overflow behavior is applied without a second sizing path
