## ADDED Requirements

### Requirement: Agent can assemble adopted media through the Cut owner

The Cut capability SHALL expose bounded Agent authoring operations that add an exact authorized audio or video ContentLocator to an exact Cut document, move or reorder an existing clip, and apply or remove one supported basic transition. Cut MUST probe the source and validate the resulting timeline before publishing one authoritative snapshot.

#### Scenario: Add an adopted shot result

- **WHEN** the Agent submits an adopted Workspace media reference and an exact Cut document target
- **THEN** Cut adds the supported stream to the requested unlocked timeline location and returns the authoritative timeline facts
- **AND** Agent, Canvas and Desktop do not construct or directly modify OTIO

#### Scenario: Reorder one existing clip

- **WHEN** the Agent requests a valid move for an exact clip in an exact Cut document
- **THEN** Cut applies the move through its canonical command path and validates the new order
- **AND** sibling clips keep their existing media authority

#### Scenario: Unsupported transition is requested

- **WHEN** the Agent requests a transition outside the supported basic set or across an invalid edit boundary
- **THEN** only that authoring operation fails visibly
- **AND** the previously published timeline remains unchanged

### Requirement: Cut reports measured delivery QC and a delivery list

After a successful export, Cut SHALL expose the stable output locator, measured technical properties, completed QC checks, unverified checks and a concise delivery list from the exact export Job. It MUST NOT infer unmeasured creative or platform compliance.

#### Scenario: Export passes available technical checks

- **WHEN** the exact Cut export completes and staged-output validation succeeds
- **THEN** the export result reports the output locator, container, codec, dimensions, frame rate, duration, audio properties, file readability and content checksum available from the owning runtime
- **AND** the delivery list distinguishes passed checks from checks that were not requested or could not be measured

#### Scenario: Export media fails QC

- **WHEN** an available required technical check fails
- **THEN** the export is not reported as a verified delivery
- **AND** the failure identifies the smallest owning edit, sound, caption, encoding or source defect without silently changing the timeline

#### Scenario: Creator requests a manifest file

- **WHEN** the creator explicitly asks to publish the delivery list as a Workspace artifact
- **THEN** the exact measured result may be authored through the admitted Workspace document path
- **AND** Cut does not create an unsolicited second manifest authority
