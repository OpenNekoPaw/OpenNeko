## ADDED Requirements

### Requirement: Durable ordinary documents use the current exact authoring authority

The Agent system prompt SHALL direct a request for a durable ordinary plan, copy draft or document through the existing `Write` Tool only when that Tool is present in the current immutable Turn Tool list. The Tool SHALL remain admitted only by an exact validated `content-document` receipt.

#### Scenario: Exact content target is available

- **WHEN** the current Turn has an exact authorized content-document receipt and the user requests the result as a saved document
- **THEN** the composed prompt directs the Agent to use the current `Write`
- **AND** success is reported only after approval and an exact successful mutation result
- **AND** completion evidence identifies the durable Workspace-relative document

#### Scenario: Current Turn has no Write authority

- **WHEN** the current Turn Tool list does not contain `Write`
- **THEN** the Agent reports that the current Turn lacks durable document mutation authority
- **AND** it does not describe chat content or a composite artifact as saved
- **AND** it does not infer an active, current, recent or merely mentioned Project or document

### Requirement: Existing receipt-bound Write remains the only mutation path

The change MUST NOT add a document creation service, UI entry, target selector, IPC operation, writer or fallback authority. Character, World and unbound Turns MUST remain unable to obtain content mutation Tools. For an admitted content-document Turn, the model-visible `Write.file_path` SHALL identify only the exact receipt document, and execution MUST reject a different path before invoking the canonical writer.

#### Scenario: Exact content receipt admits Write

- **WHEN** the current Turn carries a validated `content-document` receipt
- **THEN** `Write` is present in that Turn's immutable Tool list
- **AND** execution revalidates the same receipt before mutation
- **AND** the Tool schema exposes the receipt document id as the only accepted `file_path`

#### Scenario: Write arguments target another Workspace document

- **WHEN** an admitted content-document Turn calls `Write` with a `file_path` different from the receipt document id
- **THEN** the call fails visibly before authorizing or mutating
- **AND** neither the receipt target nor the requested sibling path is changed

#### Scenario: Non-content target requests a saved document

- **WHEN** a Character, World or unbound Turn requests a saved ordinary document
- **THEN** `Write` remains absent
- **AND** no alternate mutation Tool, target creation flow or authority fallback succeeds

#### Scenario: Write is denied or fails

- **WHEN** confirmation is denied or the exact `Write` mutation fails
- **THEN** the Turn returns the local blocking diagnostic
- **AND** it does not report the document as saved

### Requirement: Facts record the final effective Turn prompt

Desktop Agent facts SHALL begin from the exact final system prompt composed for the immutable Turn snapshot. The controller MUST NOT substitute a controller-time base prompt, and completion MUST fail visibly if the runtime never reports final prompt composition.

#### Scenario: Runtime composes the prompt

- **WHEN** Pi composes the final prompt for a Turn
- **THEN** the callback binds facts to the same exact conversation, turn and run identity
- **AND** buffered product events are projected after that binding
- **AND** completion records the same effective prompt

#### Scenario: Runtime omits prompt composition

- **WHEN** a runtime completes a Turn without invoking the final-prompt composition callback
- **THEN** only that Turn fails with a prompt-composition diagnostic
- **AND** no base prompt fallback creates a successful facts record
