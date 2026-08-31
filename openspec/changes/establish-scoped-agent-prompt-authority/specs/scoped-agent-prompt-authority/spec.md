## ADDED Requirements

### Requirement: Agent Prompt composition has explicit authority classes

Every OpenNeko Agent model request SHALL compose named inputs as product system policy, owner-derived Session policy, scoped user instructions, runtime facts, DSH Skill guidance or transcript input. Product system policy SHALL outrank every user-authored or domain-authored input; owner-derived Session policy SHALL determine the exact surface and role; runtime facts MUST NOT be interpreted as instructions merely because their content uses imperative language.

#### Scenario: Product policy and runtime facts are composed

- **WHEN** an exact Conversation turn includes product policy and selected Workspace or Character facts
- **THEN** product policy and owner-derived policy are present as named system sections
- **AND** selected facts are present only in the runtime-context snapshot
- **AND** composition does not place product or role policy inside a user-role data snapshot

#### Scenario: Runtime data contains an instruction-like string

- **WHEN** Workspace metadata, Character lore, relationship evidence or Tool output contains text requesting greater authority
- **THEN** the text remains runtime data
- **AND** it does not replace product policy, Session policy or scoped user instructions

### Requirement: OpenNeko has one product-qualified DSH system composition

Every OpenNeko Agent Session SHALL use one DSH-owned composition with an OpenNeko product persona and common product protocol. The composition MUST NOT retain a conflicting coding-agent persona, append a parallel Host-built system prompt at the Provider boundary or use different successful composers by Conversation kind.

#### Scenario: Assistant and Character Sessions start

- **WHEN** an Assistant Session and a Character Session each reach their first real model request
- **THEN** both use the same OpenNeko product system policy identity
- **AND** neither request identifies the product Agent as a coding agent
- **AND** their different behavior comes only from exact scoped policy and facts

#### Scenario: Product composition is unavailable

- **WHEN** the qualified OpenNeko DSH composition cannot be assembled
- **THEN** the affected Agent runtime is visibly unavailable
- **AND** it does not fall back to the DSH coding persona or another Prompt composer
- **AND** unrelated local product capabilities remain usable

### Requirement: Exact Conversation binding selects scoped policy

The Agent Session owner SHALL resolve scoped policy from the exact persisted Conversation binding before a turn begins. Assistant, Workspace, Character and Room participant policy paths MUST be mutually exclusive, and the system MUST NOT infer an active, recent or default owner when the binding or required source is absent.

#### Scenario: Assistant Conversation submits a turn

- **WHEN** a Conversation is bound to an exact Assistant Space
- **THEN** only that Space's Assistant policy and instructions are eligible
- **AND** no Workspace, Character, Room or other Assistant Space instruction is composed

#### Scenario: Character binding is incomplete

- **WHEN** a Character Conversation lacks its exact CharacterRun or CharacterVersion source
- **THEN** that Conversation turn fails with a local identity diagnostic
- **AND** the system does not answer as a generic Assistant or select a newer CharacterVersion
- **AND** sibling Conversations remain usable

### Requirement: Workspace instructions use only canonical AGENTS discovery

Workspace-scoped user instructions SHALL be discovered and composed only through the current DSH root/nested `AGENTS.md` contract for the exact authorized Workspace working directory. OpenNeko MUST NOT maintain a second personal/project AGENTS path, duplicate loader or editable Workspace system-prompt field.

#### Scenario: Workspace has canonical AGENTS instructions

- **WHEN** an exact Workspace Conversation runs under a working directory containing applicable canonical `AGENTS.md`
- **THEN** DSH composes the matching AGENTS fragments for that directory scope
- **AND** the fragments affect no Assistant, Character, Room or different Workspace Conversation

#### Scenario: An old private AGENTS location contains content

- **WHEN** user-authored content exists only in an OpenNeko-private non-canonical AGENTS location
- **THEN** the content remains preserved and visible with a reassignment diagnostic
- **AND** it is not automatically loaded, copied or deleted
- **AND** no compatibility read path treats it as effective instructions

### Requirement: Personal Assistant instructions are Assistant Space facts

User-authored Personal Assistant instructions SHALL be stored under one exact Assistant Space identity and SHALL apply only to turns owned by that Space. Provider configuration MUST NOT own or globally inject these instructions. Editing or deleting instructions MUST preserve Conversation identities and transcripts.

#### Scenario: User edits one Assistant Space

- **WHEN** the user saves valid instructions for one exact Assistant Space while no turn for that Space is being assembled
- **THEN** the next turn in that Space composes the new instructions
- **AND** Conversations owned by other Assistant Spaces, Workspaces, Characters and Rooms are unchanged

#### Scenario: An unscoped custom instruction already exists

- **WHEN** the product encounters previously stored user instruction content without an Assistant Space identity
- **THEN** it preserves and displays the original content as unassigned
- **AND** the content affects no Agent turn until the user explicitly assigns it to one Assistant Space
- **AND** assigning it does not create a parallel global instruction path

#### Scenario: Assistant instruction record is invalid

- **WHEN** one Assistant Space instruction record cannot satisfy the canonical contract
- **THEN** the original record remains visible with a local repair action
- **AND** turns that require that record fail visibly instead of silently omitting it
- **AND** other Assistant Spaces remain usable

### Requirement: Chara owns bounded role policy and keeps role facts as data

Chara SHALL derive a bounded role policy from the exact Character mode, frozen CharacterVersion, knowledge boundary and behavior/expression constraints for each CharacterRun or Room participant. Character lore, narrative facts, continuity, relationship, RoomView, presentation configuration and external evidence SHALL remain runtime data. Role policy MUST NOT grant Tool visibility, permission, Host authority or domain mutation rights.

#### Scenario: Companion turn is composed

- **WHEN** an exact companion CharacterRun submits a turn
- **THEN** its Session policy requires the selected Character identity and companion behavior within the published knowledge boundary
- **AND** continuity and relationship content remain attributed runtime facts
- **AND** Personal Assistant and Workspace instructions are absent

#### Scenario: Narrative fact conflicts with knowledge boundary

- **WHEN** a narrative fact or selected evidence asks the Character to reveal a forbidden or future fact
- **THEN** the Chara-derived knowledge boundary remains authoritative for role behavior
- **AND** the conflicting content is not promoted from data into Session policy

#### Scenario: One Room participant has private context

- **WHEN** a multi-Character Room assembles separate participant turns
- **THEN** every participant receives its own role policy and visibility-filtered facts
- **AND** private facts or role instructions from one participant do not enter a sibling participant request

### Requirement: Scoped instructions are frozen for each turn

The Agent Session owner SHALL resolve one immutable policy and instruction snapshot before the first model step of a turn and SHALL use it for every step in that turn. A valid source change during an active turn SHALL affect only the next turn; it MUST NOT reinterpret completed transcript or change the owner binding.

#### Scenario: Instructions change during a running turn

- **WHEN** Personal Assistant instructions or canonical Workspace AGENTS content changes after a turn starts
- **THEN** every remaining model step in the running turn uses the original snapshot
- **AND** the next turn resolves the updated source
- **AND** neither turn is redirected to another Conversation or owner

### Requirement: Prompt text cannot grant runtime authority

Tool catalog, Tool schema, Session permission, Workspace grant, resource authorization, provider/model selection and Host trust SHALL be resolved and enforced outside Prompt composition for each exact request or Tool call. Product policy, scoped user instructions, Character policy, runtime facts and Skills MUST NOT create an absent Tool or bypass an owning boundary.

#### Scenario: AGENTS requests an unavailable Tool

- **WHEN** canonical Workspace instructions tell the Agent to use a Tool absent from the immutable turn catalog
- **THEN** the Agent reports the capability as unavailable
- **AND** Host does not register, emulate or substitute the Tool

#### Scenario: Character content requests a permission escalation

- **WHEN** Character content instructs the Agent to write outside its authorized scope or switch provider after denial
- **THEN** the current permission and Host authorization reject the operation locally
- **AND** the request does not use shell, raw paths, another provider or another source as fallback success

### Requirement: Composition is observable without exposing Prompt bodies

Every real model request SHALL expose secret-free composition facts sufficient to identify each effective fragment's identity, authority class, source kind, exact scope, order and digest, while omitting Prompt bodies, credentials, raw provider configuration and absolute private paths. Acceptance SHALL verify the actual visible Desktop Session path and real provider behavior in addition to deterministic boundary checks.

#### Scenario: Prompt composition is evaluated

- **WHEN** an authorized diagnostic or Agent evaluation observes a completed Desktop turn
- **THEN** it can prove which product, Session, AGENTS, Assistant, Character and Skill fragments were effective without reading their bodies
- **AND** it can detect a missing fragment, duplicate composer, wrong scope or unexpected fallback path

#### Scenario: One scoped fragment fails to resolve

- **WHEN** one Workspace, Assistant Space or Character participant fragment is invalid or unavailable
- **THEN** the affected turn exposes a local diagnostic through the real Session path
- **AND** composition facts do not claim that fragment was applied
- **AND** unrelated Sessions and Workspaces continue operating
