# agent-streaming-render-bounding Specification

## Purpose
TBD - created by archiving change bound-agent-streaming-render-work. Update Purpose after archive.
## Requirements
### Requirement: Streaming presentation work is bounded per interval

The Agent Webview SHALL commit every live projection patch to the authoritative conversation projection
replica synchronously and completely, while SHALL notify render subscribers (React re-render, message-list
re-projection, virtualizer and scroll work) at most once per bounded presentation interval during
streaming text/thinking appends. Completion and non-append patches SHALL notify immediately.

#### Scenario: Many streaming appends arrive in one interval

- **WHEN** a live turn projects N streaming text/thinking append patches without completion
- **THEN** the replica snapshot contains the full concatenated content after every patch
- **AND** render subscribers are notified a bounded number of times independent of N
- **AND** no final content is lost once the pending flush completes

#### Scenario: Completion patch arrives

- **WHEN** the owning turn's completion patch arrives after streaming appends
- **THEN** the replica notifies subscribers immediately with the terminal content and completion
- **AND** no pending coalesced flush can later overwrite or erase the terminal snapshot

#### Scenario: A non-append patch arrives

- **WHEN** a Tool Call result, confirmation, replace, snapshot or complete patch arrives without completion
- **THEN** the replica notifies subscribers immediately instead of coalescing it with streaming text

### Requirement: Projection and Markdown publication is coherent per Tab

For one Tab and one projection commit, the Agent Webview SHALL NOT expose a Markdown external-store
snapshot whose source differs from the rendered Projection content for the same Timeline item. A bounded
streaming flush SHALL commit the Markdown parser snapshot before publishing Projection listeners, and SHALL
publish Markdown listeners only after the Projection publication. An immediate non-streaming Projection
publication SHALL first flush pending Markdown updates for the same conversation.

#### Scenario: A streaming append reaches the bounded presentation timer

- **WHEN** one append has synchronously advanced the authoritative Projection while rendered content and
  Markdown presentation remain on the prior source
- **THEN** the bounded flush commits the Markdown snapshot to the new source
- **AND** Projection listeners publish the matching rendered content before Markdown listeners run
- **AND** no subscriber can observe different character counts for the same Timeline item

#### Scenario: An immediate patch follows a pending streaming append

- **WHEN** a completion or non-append patch requires immediate Projection publication while a Markdown
  update for that conversation remains pending
- **THEN** the pending Markdown update is committed before the immediate Projection listener runs
- **AND** the Projection and Markdown publications expose one matching source

### Requirement: Patch application avoids full-transcript cloning

Applying a conversation projection patch SHALL clone and rebuild only the turn the patch targets. Frozen
sibling turns SHALL be shared by reference, SHALL remain immutable across subsequent patches, and SHALL
not be recursively traversed again after the canonical deep-freeze path has verified them.

#### Scenario: A multi-turn conversation receives a streaming patch

- **WHEN** a patch targets one turn of a conversation with multiple frozen turns
- **THEN** the returned snapshot shares the unpatched turns by reference
- **AND** the patched turn is a new immutable object
- **AND** the previous snapshot and its turns are not mutated
- **AND** canonical deep-freeze does not revisit the shared sibling subtree

### Requirement: Streaming never blocks unrelated surfaces

Streaming projection and presentation SHALL NOT introduce a global loading, disabled or overlay state that
blocks the Desktop shell, Canvas or project browser. Those surfaces SHALL remain operable while an Agent
response streams.

#### Scenario: Canvas and project browser remain interactive during streaming

- **WHEN** a live Agent response streams and the Agent pane re-renders on the bounded interval
- **THEN** no application-wide disabled/overlay state is applied to Canvas or the project browser
- **AND** interaction on those surfaces is not gated by Agent streaming state
