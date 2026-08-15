## ADDED Requirements

### Requirement: Project-bound World creation reuses the canonical Agent Composer

Project management SHALL offer direct manual World creation and import-for-editing for one exact Project. Agent-assisted World creation SHALL use the canonical Composer inside that Project's exact Creative Workspace with the ordinary builtin `world-creator` Skill activated. Installed World management MUST NOT expose quick generation, blank creation, a second Composer, provider/model selector, Agent controller, Conversation implementation, or World mutation service.

#### Scenario: User chooses Agent-assisted creation

- **WHEN** an Agent in one exact Project Creative Workspace activates `world-creator`
- **THEN** the ordinary Composer preserves the request and the World owner requests one exact fresh project-local target through standard approval
- **AND** installed World management does not call a model, create an implicit Conversation, or mount authoring as a prerequisite

#### Scenario: User chooses manual authoring

- **WHEN** the user chooses Manual Create instead
- **THEN** World owner creates one empty reviewable WorldProject only after exact destination authorization and opens its Workspace authoring target
- **AND** Agent Entry, a WorldVersion, WorldRun and WorldSave are not created

### Requirement: World Creator produces evidence-aware review candidates

The builtin `world-creator` Skill SHALL guide the Agent to produce a coherent, reviewable World draft proposal covering premise, scope and boundaries, stable rules, locations, organizations, initial facts, actor/resource requirements, interaction affordances, source-backed facts, creative inferences, contradictions and unresolved questions. It SHALL preserve provenance and uncertainty and MUST NOT present unsupported invention as established canon or fabricate exact CharacterVersion, Entity, Asset or capability identities.

#### Scenario: User provides source material and a creative prompt

- **WHEN** the authorized context contains source-backed facts plus underspecified creative goals
- **THEN** the Agent separates evidence-backed facts from inferred suggestions and leaves unresolved conflicts visible
- **AND** proposed actors/resources without exact existing identities remain requirements or placeholders for review

#### Scenario: User asks to enter or roleplay in a World

- **WHEN** the request is an interaction/runtime intent rather than authoring a new World
- **THEN** `world-creator` does not reinterpret it as permission to create or mutate a WorldProject
- **AND** it reports the missing exact runtime target or routes only through an available typed launch path

### Requirement: Skill content does not own tool or host protocols

The `world-creator` Skill body SHALL describe creative method, evidence boundaries, review expectations and output semantics only. Concrete tool names, operation names, command schemas, IPC, Workspace grants, filesystem paths, package authoring lifecycle, polling/task protocol, cache behavior and Webview steps SHALL remain in system prompts, World capability prompts, typed tool schemas or runtime catalogs. Machine-readable metadata MAY name allowed tools without copying their protocol into Skill prose.

#### Scenario: Skill boundary gate runs

- **WHEN** builtin Skill content is validated
- **THEN** the gate accepts creative methodology and machine-readable allowed-tool metadata
- **AND** it rejects natural-language tutorials for World commands, host paths, authoring receipts or runtime protocols

### Requirement: Agent creation requires an exact fresh Project target

Before any World fact mutation, the Agent SHALL already be bound to one exact authorized Project Creative Workspace. World owner SHALL create one fresh project-local WorldProject and an operation-level write receipt bound to that exact target; Agent writes SHALL be rejected if Project, target, authority, sender, or receipt does not match. Prompt text, management selection, installed release, mounted authoring Root, current/recent Workspace, and Agent Conversation identity MUST NOT grant write authority.

#### Scenario: User generates a project-local World

- **WHEN** the user operates inside one exact authorized Project and approves fresh target creation
- **THEN** World creates that project-local WorldProject and Project records its exact membership through the canonical workflow
- **AND** the record does not enter the installed library or rebind the originating Conversation

#### Scenario: User cancels before target authorization

- **WHEN** the user cancels before destination authorization or fresh-target creation
- **THEN** no WorldProject, Project membership, write receipt, Tool approval, WorldVersion, Run or Save is created

### Requirement: Agent output remains a proposal until World owner accepts it

Model output, attached source material and Conversation text SHALL remain non-authoritative until the World owner validates and the user accepts the exact candidate against the exact WorldProject. Candidate application MUST NOT publish a WorldVersion, start a preview or formal runtime, create a Save, commit an event, alter another WorldProject or modify referenced Character/Entity/Asset facts as a side effect.

#### Scenario: Candidate contains unsupported or contradictory facts

- **WHEN** World validation finds unresolved contradictions or unsupported references
- **THEN** the candidate remains reviewable with exact diagnostics and unaffected candidate sections remain inspectable
- **AND** no partial silent canon, publication or runtime record is created

#### Scenario: Candidate targets another WorldProject

- **WHEN** a write request names a WorldProject different from the approved fresh target
- **THEN** World rejects only that request with an identity-qualified diagnostic
- **AND** both WorldProjects and the Agent Conversation remain otherwise usable

### Requirement: World Creator behavior has evaluation evidence

The change SHALL add script-driven Agent Evaluation coverage for `world-creator` authoring intent, provenance, uncertainty, exact target isolation and forbidden side effects. Key-free harness results SHALL prove only suite readiness; behavior acceptance SHALL include the applicable real provider Desktop paths required by repository policy. Evaluation MUST NOT become a product Skill consumer, direct runtime shortcut or second Agent controller.

#### Scenario: World Creator evaluation matrix runs

- **WHEN** release evidence is collected for the Skill and typed handoff
- **THEN** cases cover reviewable creation, runtime-intent distinction, evidence/inference separation, unsupported reference handling, cancellation, target mismatch and no automatic publish/run
- **AND** unexecuted real-provider or visible-UI cases are reported as residual risk rather than inferred success
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Management quick generation, global destination choice, and standalone fresh World creation are superseded. The builtin Skill remains valid only inside an exact Project Workspace through a fresh World target and standard approval.
