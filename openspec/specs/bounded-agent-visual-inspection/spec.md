# bounded-agent-visual-inspection Specification

## Purpose

Define bounded, authorized and transient visual inspection for Agent decisions without creating a second model,
Session, compaction path or persistent creative fact.

## Requirements

### Requirement: Agent can inspect a bounded image overview batch

The Content capability SHALL expose one `openneko_read_images` Tool that accepts one to four exact authorized image
ContentLocators and returns exactly one bounded native image overview with a deterministic slot-to-locator mapping.
The Tool MUST NOT accept original-detail mode, pagination, a nested input wrapper, duplicate locators or more than
four sources.

#### Scenario: Compare four authorized document pages

- **WHEN** an image-capable model requests overview inspection of four distinct supported image locators
- **THEN** Content returns one contact-sheet image block whose slots follow input order
- **AND** the result maps every slot to its complete source ContentLocator

#### Scenario: Batch exceeds the hard limit

- **WHEN** the Tool receives zero sources, more than four sources, duplicate locators, original detail, pagination or a nested input wrapper
- **THEN** the canonical decoder rejects the current request before any Host read
- **AND** no alternate sequence of single-image reads is started

### Requirement: Overview batch preserves exact authorization and failure isolation

Every source in a batch SHALL be read under the exact calling Conversation Workspace authorization. The contact sheet
SHALL be published only after every source is successfully decoded as a supported image. A failed source MUST fail
only the current batch and MUST NOT switch source, provider, model or Workspace.

#### Scenario: One batch source is unauthorized

- **WHEN** one source in an otherwise valid batch is outside the exact Workspace grant
- **THEN** the batch fails with a diagnostic identifying that source slot
- **AND** no partial contact sheet is published
- **AND** sibling Tools, Sessions and Workspaces remain available

### Requirement: Selected detail inspection uses the canonical single-image Tool

The Agent SHALL use `openneko_read_image` only for one exact image selected for closer inspection. Batch overview
output MUST NOT be treated as an original asset or silently expanded into multiple original-detail reads.

#### Scenario: Inspect one selected page in original detail

- **WHEN** a page selected from a completed overview batch requires close visual verification
- **THEN** the Agent requests that exact locator through `openneko_read_image` with original detail
- **AND** no unselected batch source is loaded at original detail

### Requirement: Visual inspection preserves source references without persisting derived previews

After a successful overview or detail Tool completion, Agent Runtime SHALL use the validated Tool input as authority
and immediately project the deduplicated source document and exact original image references to the Canvas admitted
for that turn. The derived contact sheet and other Tool preview attachments MUST remain transient and MUST NOT become
Canvas nodes, Assets, project facts or generated deliverables.

#### Scenario: Read images without a terminal artifact

- **WHEN** the Agent completes an overview or detail read before the turn has ended
- **THEN** the DSH transcript records the Tool execution and attachment identity
- **AND** the admitted Canvas immediately receives the source document and exact original image references
- **AND** no derived contact-sheet attachment becomes a Canvas node

#### Scenario: Terminal artifact follows completed image reads

- **WHEN** the same Workspace turn later publishes an admitted terminal artifact
- **THEN** terminal delivery publishes that artifact independently of the completed Tool projection
- **AND** it does not duplicate the contact-sheet attachment or create another image authority

### Requirement: DSH owns active image Tool context governance

Completed image Tool results SHALL be governed by the standard DSH Session Tool-result pruning and qualified
compaction path. The product MUST retain replayable transcript and attachment identity while preventing OpenNeko from
creating a second transcript, image-context store or compaction path.

#### Scenario: Long visual-analysis conversation continues

- **WHEN** completed overview or detail Tool results no longer need their raw image payload in a later model turn
- **THEN** the canonical DSH Session may replace that active model input through its qualified pruning or compaction behavior
- **AND** the visible transcript and admitted attachment identity remain replayable
- **AND** OpenNeko does not rewrite transcript history or select an alternate Session path
