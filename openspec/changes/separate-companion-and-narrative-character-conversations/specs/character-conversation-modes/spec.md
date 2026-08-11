## ADDED Requirements

### Requirement: Character Conversation mode is explicit and immutable

Every Character Dialogue or Room SHALL be created in exactly one `companion` or `narrative` mode. The selected mode, exact CharacterVersion identities and Conversation owner SHALL be frozen before the first Agent turn. An active Conversation MUST NOT change mode, reinterpret prior messages under another mode or use a prompt command, model response or presentation selection as mode authority.

#### Scenario: User changes a companion conversation to narrative

- **WHEN** the user requests Narrative from an active Companion Conversation
- **THEN** the current Conversation remains Companion and the product offers creation of a new Narrative Conversation
- **AND** no transcript, memory, CharacterRun or RoomEvent is copied or reinterpreted implicitly

### Requirement: Character roleplay reuses the canonical Neko Agent lifecycle

Every Companion or Narrative participant SHALL execute through an exact Agent-owned Conversation and the same launch, Turn, configuration, provider/model, Skill, Tool, Approval, permission, cancellation and transcript services used by Neko Agent. Each CharacterRun or Room participant SHALL own an independent Agent Conversation configuration; no global Character provider/model setting may determine every Character session. The started turn SHALL freeze the effective Agent configuration, provider/model and mode-qualified capability receipt. Character roleplay MUST NOT create a secondary Assistant Conversation/AgentSession, Character-owned provider runner or direct AgentWorkspace success path.

Chara SHALL participate only through strict Character/Room domain binding, bounded context projection, a frozen mode capability constraint and domain-owned candidate commands. Agent SHALL remain the only owner of prompt composition, effective configuration, Skill activation, Tool schemas, Approval and permission decisions. A Companion Character MAY invoke Agent Skills/Tools under its exact Agent Conversation configuration. A Narrative Character MUST receive no Skill prompt content or Tool definitions and MUST NOT execute a tool, even when a stale, fabricated or previously enabled Agent configuration requests one. Chara MUST NOT copy or override Agent tools and policies.

#### Scenario: User compares one simple role on two models

- **WHEN** the user starts two independent Conversations with the same exact minimal CharacterVersion and selects a different exact provider/model for each
- **THEN** each Agent Conversation freezes its effective model and configuration in its own turn receipt
- **AND** both use the same Character domain-context contract without sharing transcript state or switching to an Assistant lane

#### Scenario: One Character invokes an Agent tool

- **WHEN** the exact Companion Agent Conversation configuration exposes a tool to one Character and the model requests it
- **THEN** the standard Agent Tool/Approval/permission lifecycle handles the request and records its normal transcript projection
- **AND** Chara does not register another handler, pre-authorize the call or copy tool runtime state into CharacterRun

#### Scenario: Narrative attempts to activate a Skill or Tool

- **WHEN** a Narrative participant is submitted with a configured, stale or fabricated Skill/Tool activation
- **THEN** Agent applies the frozen Narrative constraint before prompt composition and provider/tool execution and produces an effective empty Skill/Tool receipt
- **AND** no Skill content, Tool definition, Approval, tool result, Companion fallback or Character mutation is created

#### Scenario: Persisted Companion Assistant lane is submitted

- **WHEN** an old or fabricated Companion Assistant lane identity is decoded or submitted
- **THEN** the request is rejected as an unsupported replaced path before provider execution
- **AND** no hidden AssistantSession, fallback Character turn or transcript mutation is created

### Requirement: Character Agent configuration is participant-exact

The Character Workbench role/participant manager SHALL read and update provider/model and other permitted Agent configuration through the Agent public configuration service for one exact CharacterRun or Room participant Conversation. Companion MAY additionally configure standard Skill/Tool availability subject to Agent authorization. Narrative SHALL omit or disable Skill/Tool activation controls because its effective capability set is always empty. Configuration updates SHALL affect only later turns for the named participant and MUST NOT mutate CharacterVersion, sibling participants, existing turn receipts or a global Character default.

#### Scenario: Two Room participants use different models and capabilities

- **WHEN** the user selects provider/model A with a gameplay capability for one Companion participant and provider/model B without that capability for another
- **THEN** later turns freeze the corresponding independent Agent configuration receipt for each participant
- **AND** neither model, capability, Approval state nor transcript leaks to the sibling participant

#### Scenario: User edits a Narrative participant configuration

- **WHEN** the user selects another provider/model for one Narrative participant in the participant manager
- **THEN** the next turn uses that participant's selected provider/model with an empty effective Skill/Tool receipt
- **AND** the manager does not offer a successful Skill/Tool activation, republish CharacterVersion or alter another participant

### Requirement: Workspace Agent creates Character drafts through public authoring capabilities

A Workspace-bound Agent MAY discover an authoring-only `character-creation` Skill and Chara-contributed capability after the existing Authoring target chooser creates and binds one exact fresh CharacterProject under an authorized Workspace/ContentProject. The primary workflow SHALL transform user prompt text and Agent-authorized reference projections into one reviewable Character definition, separate confirmed source facts from inferred suggestions, and fill only that bound draft through a confirmation-gated Chara authoring command. It MUST NOT allocate or infer a CharacterProject identity, rebind the Workspace Conversation, publish CharacterVersion, create Storyline/CharacterRun/Room/Companion continuity, or call a Character provider/runtime directly.

Preview, validation and improvement MAY operate on an exact created CharacterProject or authoring-test snapshot as explicit secondary workflows. Automated Character validation SHALL compose one tool-free Character responder and one independent Probe Agent. Evidence SHALL remain scoped to validation turns, reports MAY be saved only under the authorized project-local character-test artifact location, and suggested profile, relationship, knowledge or story changes MUST remain unapplied until the user confirms the existing Chara owning command.

#### Scenario: Workspace Agent creates a draft character from prompt and material

- **WHEN** the user asks the Workspace Agent to create a character from prompt text and exact authorized source references
- **THEN** the Authoring chooser first creates and binds one exact fresh CharacterProject, after which the Skill proposes a bounded Character definition with source-backed facts separated from inferred suggestions and asks for mutation confirmation
- **AND** confirmation fills only that draft without publishing a CharacterVersion or creating a Conversation, Room, continuity or memory record

#### Scenario: Workspace Agent previews an exact draft Character

- **WHEN** a Workspace Agent invokes the secondary preview operation with an authorized exact CharacterProject draft
- **THEN** the capability returns a bounded authoring artifact without creating a formal Character Conversation
- **AND** the Workspace Conversation keeps its original binding and no Character fact or long-term memory is promoted automatically

#### Scenario: Workspace Agent validates a draft Character

- **WHEN** an authorized Workspace Agent requests Character validation for an exact authoring-test snapshot
- **THEN** a tool-free Character responder and separate Probe Agent produce a project-local report covering identity, voice, knowledge boundaries, relationships and reliability
- **AND** no formal Dialogue/Room, CharacterRun, Companion continuity, Workspace tool grant or unconfirmed entity mutation is created

### Requirement: External materials are companion-only authorized turn context

Companion SHALL reuse the Agent-owned reference, resource-grant and context-provider contracts to attach authorized Workspace, Content, Asset or supported external material to the selected Character turn. The owning source SHALL retain bytes and authority; Agent turn context SHALL receive only the qualified projection required by that exact participant. Narrative MUST reject external-material attachment before context materialization. Chara MUST NOT define a parallel attachment contract or store raw paths, and active Workspace inference or implicit search results MUST NOT enter Character records or Agent transcript metadata.

#### Scenario: Companion Character reads an authorized document

- **WHEN** the user attaches an exact authorized document and submits one Companion Character turn
- **THEN** Agent materializes that document through its owning context provider for the current turn
- **AND** the document and Character output do not become Character canon or accepted memory without a later explicit owning operation

#### Scenario: Narrative receives an external attachment

- **WHEN** a Narrative composer submission contains an external-material reference
- **THEN** submission is blocked with a Narrative external-context-forbidden diagnostic
- **AND** no material bytes, summary, Character turn or memory candidate is created

### Requirement: Narrative consumes only authored character context

Narrative SHALL bind one exact CharacterVersion and MAY bind one exact CharacterStoryline, CharacterStorylineVersion and StorylineNode selected before first submit. It SHALL use the same canonical Agent lifecycle with its exact Character domain-context projection and effective Agent configuration. Narrative SHALL NOT require or bind World, Experience, Save, branch or external Composition authority and SHALL NOT create a StorylineRun.

#### Scenario: User starts narrative at an exact node

- **WHEN** the user confirms an eligible CharacterVersion, StorylineVersion and StorylineNode
- **THEN** Chara creates one Narrative Conversation whose turn context is frozen to those exact authored identities
- **AND** no StorylineRun, Experience binding, external save or companion continuity mutation is created

#### Scenario: User starts free narrative without a storyline

- **WHEN** the user explicitly selects Narrative without a StorylineNode
- **THEN** the Conversation uses only the exact CharacterVersion and session transcript as its authored role context
- **AND** it does not infer a recent/latest Storyline, node or external scene

### Requirement: Dialogue and Room reuse one mode policy without sharing participant state

One Character selection SHALL create Dialogue and multiple Character selections SHALL create Room under the same selected Conversation mode. Every agent-controlled Character participant SHALL retain an independent Character AgentSession, provider/model receipt and authorized context. A Narrative Room MAY select an independent exact StorylineNode for each Character participant; absence of a participant node SHALL be explicit and MUST NOT inherit another participant's story information or narrative memory.

#### Scenario: Narrative Room has two authored character contexts

- **WHEN** two Character participants launch with different exact StorylineNode selections
- **THEN** each primary AgentSession receives only its own CharacterVersion and node-qualified narrative context plus its visibility-filtered RoomView
- **AND** neither participant receives the other participant's private story facts, narrative memories or model configuration

### Requirement: Mode failures remain local and leave no partial owner

Invalid mode fields, unavailable CharacterVersion, stale StorylineNode, forbidden Narrative attachment or Skill/Tool activation, unavailable effective Agent configuration, denied Companion tool call or participant context failure SHALL reject only the affected launch, turn or tool operation with an exact diagnostic. A pre-commit failure MUST leave no partial CharacterRun, Room, Agent Conversation, memory candidate or first message, while a post-commit provider/tool failure SHALL preserve the already-created Conversation owner and report the failed operation.

#### Scenario: One Room participant has stale narrative context

- **WHEN** launch validation finds one participant's StorylineNode does not belong to its selected StorylineVersion
- **THEN** the Room launch fails before every CharacterRun and AgentSession commit
- **AND** existing Character, Room and Assistant Conversations remain usable
