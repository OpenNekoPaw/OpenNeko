## ADDED Requirements

### Requirement: Resource actions are derived from semantic facts

Resource surfaces SHALL request professional application actions using exact resource identity,
owning revision or candidate, resource kind/MIME, qualified exchange operation and exact application
readiness. A filename extension MAY participate in tool-specific validation but MUST NOT alone create
an application association or successful handoff path.

#### Scenario: An eligible image candidate and ready ComfyUI profile exist

- **WHEN** the resource service resolves the candidate and the ComfyUI input operation accepts its
  semantic media facts
- **THEN** resource details and the context menu offer “Send to ComfyUI…”
- **AND** both actions invoke the same canonical handoff service

#### Scenario: Only the filename extension appears compatible

- **WHEN** the resource owner cannot prove the exact resource identity, authorization or media facts
- **THEN** no executable handoff action is projected
- **AND** the surface reports the precise missing requirement when the user inspects integration state

### Requirement: Handoff freezes an exact authorized source

A professional application handoff SHALL bind the exact source identity and revision/candidate,
target integration, semantic operation, approved content locator, expected loss and approval state.
Renderer MUST NOT receive a raw local path, executable path, credential, process handle or window
handle. Desktop SHALL resolve native resources only for the exact sender and operation.

#### Scenario: User confirms a handoff

- **WHEN** the source, target, exchange operation and required approval are valid
- **THEN** the owning domain freezes or resolves the exact durable input
- **AND** Desktop launches or transfers only the sender-authorized resource to the exact application

#### Scenario: Source changes before confirmation

- **WHEN** the expected source revision no longer matches the authoritative resource
- **THEN** the handoff is rejected with a stale-source diagnostic
- **AND** it does not substitute the current selection, latest candidate or raw file path

### Requirement: Handoff outcomes do not overclaim external completion

The service SHALL distinguish discovery, launch, transfer, external operation, result verification and
round-trip ingest outcomes. Application launch/focus or input delivery MUST NOT be reported as an edit,
workflow, render or import success.

#### Scenario: Target application opens successfully

- **WHEN** the exact application accepts a launch or open request
- **THEN** the handoff records only the launch/transfer receipt
- **AND** further completion remains pending until the required independent evidence exists

#### Scenario: External operation outcome is unknown

- **WHEN** the target accepted an operation but no qualified result evidence is available
- **THEN** the handoff remains outcome-unknown with a visible review action
- **AND** no Asset, candidate or success transcript is fabricated
