## ADDED Requirements

### Requirement: Locked DSH defines the Skill runtime contract

OpenNeko SHALL treat the publicly exported contracts and behavior of the precisely locked DeepSeek Harness Skill packages as the sole production definition of Skill discovery, source precedence, invocation policy, loading, rendering and relative-resource guidance. OpenNeko MUST NOT reject an otherwise DSH-valid Skill because of a fixed Skill count, a single-primary-Skill rule, an artifact-profile prerequisite, a supported invocation-policy combination, flat-file layout, or prose that names an available public Tool or model.

#### Scenario: DSH-valid Skill uses public Tool guidance

- **WHEN** a Skill accepted by the locked DSH filesystem provider explains how to use a public Tool that remains subject to the current Tool catalog, schema and permission
- **THEN** OpenNeko SHALL NOT fail Skill qualification solely because that Tool is named in prose
- **AND** the Skill SHALL acquire no Tool visibility, permission or execution authority from its content

#### Scenario: Product policy attempts to cap Skills

- **WHEN** a catalog contains multiple applicable Skills or more Skills than a product guideline anticipated
- **THEN** OpenNeko SHALL preserve the DSH catalog and loading behavior
- **AND** SHALL NOT select one primary Skill or hide siblings through a hard product limit

### Requirement: Skill lookup preserves DSH scope and source semantics

Every production Skill catalog, resolution and load SHALL use the exact DSH Agent scope and the Host-authorized lookup cwd for the bound Conversation. Assistant, Workspace, project, personal, custom, runtime and bundled sources SHALL retain the locked DSH provider ranks and nearest-scope resolution. OpenNeko MUST NOT mirror Workspace or personal Skills into the bundled root or select a source by active/recent Workspace state.

#### Scenario: Workspace Skill shadows a bundled Skill

- **GIVEN** an exact Workspace Conversation whose authorized project root contains a valid same-named DSH project Skill
- **WHEN** its Agent scope resolves that name
- **THEN** the project Skill SHALL win according to DSH scope/source precedence
- **AND** management, Composer, model loading and explicit invocation SHALL observe the same winner

#### Scenario: Workspace authorization is unavailable

- **WHEN** a restored Conversation can no longer resolve its exact Workspace authority
- **THEN** project Skill lookup SHALL fail locally with a diagnostic
- **AND** SHALL NOT switch to another Workspace, an Assistant cwd, a bundled copy or an older catalog

### Requirement: Model and user invocation policies remain independent

OpenNeko SHALL preserve all four DSH combinations of `modelInvocable` and `userInvocable`. User catalogs and explicit gestures SHALL expose only user-invocable Skills; model catalogs and the model Skill loader SHALL expose only model-invocable Skills; trusted internal reads SHALL NOT reinterpret either policy.

#### Scenario: User-only Skill is invoked explicitly

- **WHEN** a Skill is user-invocable and not model-invocable
- **THEN** the exact user gesture MAY inject it through the DSH explicit invocation path
- **AND** the model Skill catalog and loader SHALL NOT advertise it

#### Scenario: Model-only Skill is requested through Composer selection

- **WHEN** a Skill is model-invocable and not user-invocable
- **THEN** it SHALL remain available to the DSH model loader
- **AND** the user catalog SHALL omit it and a fabricated explicit selection SHALL fail visibly

### Requirement: One input may compose multiple Skills

The Host input contract SHALL preserve an ordered collection of explicitly selected Skills and the user's request. It SHALL validate every selected name against one complete exact-session DSH snapshot and submit one DSH-native input. It MUST NOT impose a single-primary-Skill rule or a Skill-count limit distinct from the general bounded input payload.

#### Scenario: User explicitly selects two Skills

- **WHEN** both selected Skills remain user-invocable in the exact Session catalog
- **THEN** one user input SHALL reach DSH with both native Skill gestures and the original request
- **AND** DSH SHALL own parsing, duplicate suppression, content rendering and injection

#### Scenario: One selected Skill is stale

- **WHEN** any selected Skill is absent, stale, non-user-invocable or observed through an incomplete catalog
- **THEN** the unsubmitted input SHALL fail visibly as a bounded unit
- **AND** no selected token SHALL continue as ordinary prompt prose or invoke an OpenNeko loader

### Requirement: Relative resources remain progressive DSH guidance

OpenNeko SHALL preserve DSH `resourceBase` guidance for loaded Skills. It SHALL NOT automatically enumerate, attach or inject all relative resources. A resource read SHALL use an available authorized Tool and a missing, denied or unsafe resource SHALL fail locally without invalidating sibling Skills.

#### Scenario: Loaded Skill references one relative guide

- **WHEN** the model follows the DSH-rendered resource guidance and reads that guide through an authorized Tool
- **THEN** only the requested resource SHALL enter the turn context
- **AND** unrelated package resources SHALL remain unloaded

#### Scenario: Resource path escapes its package

- **WHEN** a requested relative resource traverses outside the authorized resource base
- **THEN** the read SHALL be denied visibly
- **AND** the loaded Skill, sibling catalog entries and unrelated Sessions SHALL remain available

### Requirement: Management and runtime share one registry observation

Session-scoped management, Composer catalog, explicit invocation and model loading SHALL derive from the same DSH Agent scope and lookup cwd. A global management view MAY show only explicitly labeled global sources; it MUST NOT masquerade as a Workspace-winning catalog. Projection SHALL preserve invocation policy and bounded source metadata while withholding physical paths, resource bases and Skill bodies from Renderer contracts.

#### Scenario: Management reopens during a catalog change

- **WHEN** the exact DSH snapshot reports `complete: false`
- **THEN** the UI SHALL retain the available candidates with an incomplete diagnostic
- **AND** SHALL NOT present the snapshot as authoritative or clear valid sibling entries
