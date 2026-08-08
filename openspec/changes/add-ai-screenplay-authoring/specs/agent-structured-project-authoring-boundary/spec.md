## ADDED Requirements

### Requirement: Structured project documents are protected from generic Agent file access

Generic Agent content reads and writes MUST be rejected for Canvas `.nkc`, Cut `.otio` and every
explicitly registered structured/spatial/timeline project format. Classification MUST be exact and owner-declared;
unknown JSON or an unsupported domain operation MUST NOT fall back to a raw file path.

#### Scenario: Agent requests raw Canvas or Cut project bytes

- **WHEN** a core file Tool targets an exact `.nkc` or `.otio` project document
- **THEN** the file boundary rejects only that operation with a protected-project diagnostic
- **AND** it identifies the owning domain capability without exposing project bytes

#### Scenario: Agent edits ordinary JSON

- **WHEN** a Workspace JSON file is not an owning-domain project document
- **THEN** it remains eligible for native content/data file authoring
- **AND** JSON syntax alone does not route it to Canvas or Cut

### Requirement: Structured project reads and writes use exact owning-domain capabilities

Agent inspection and mutation of a structured project MUST use its owning-domain query and authoring
contracts with exact document/object identity and expected project revision. The operation MUST remain
headless and MUST NOT require selection, viewport, playhead or a mounted Renderer.

#### Scenario: Agent changes a Canvas document

- **WHEN** the Agent adds or updates Canvas content
- **THEN** Canvas resolves the exact project/node/resource identities and applies one validated
  revisioned mutation through its owning codec
- **AND** no generic JSON writer or Renderer-private node command participates

#### Scenario: Agent changes a Cut timeline

- **WHEN** the Agent inserts, moves, trims or updates timeline content
- **THEN** Cut resolves the exact OTIO document/track/clip/time identities and applies one validated
  revisioned mutation through its owning codec
- **AND** no generic JSON writer or active playhead chooses the target

### Requirement: Structured capability failure has no raw-file fallback

The current structured request MUST fail on invalid input, missing operation, stale revision, codec
rejection or unavailable owning capability. The Agent MUST NOT retry the same intent through generic
file Tools, shell redirection, another provider/adapter or active/recent document state.

#### Scenario: Requested structured operation is unavailable

- **WHEN** the exact Canvas or Cut capability cannot express or validate the requested mutation
- **THEN** the request returns a typed diagnostic and preserves the project
- **AND** generic file access to the protected target remains denied

### Requirement: Structured-path Evaluation proves denial and owning authority

The Evaluation platform MUST include a boundary case that proves protected raw access is denied and
that only an available exact owning-domain capability can produce a successful project mutation.

#### Scenario: Evaluation detects protected-file bypass

- **WHEN** a structured project request reads or writes `.nkc`/`.otio` through a generic file Tool
- **THEN** the canonical-path assertion fails even if the resulting JSON passes syntax validation
