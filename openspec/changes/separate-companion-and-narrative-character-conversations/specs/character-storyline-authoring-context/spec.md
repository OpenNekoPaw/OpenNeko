## ADDED Requirements

### Requirement: CharacterStoryline is a stable authoring identity

Chara SHALL represent each independently managed personal story arc as a stable CharacterStoryline identity owned by one CharacterProject. Mutable Storyline draft and immutable user-managed CharacterStorylineVersion publications SHALL be distinct. Different arcs MUST NOT be represented as versions of one Storyline, and revisions of one arc MUST NOT be represented as unrelated Storylines.

#### Scenario: Author publishes a revision of one story arc

- **WHEN** the author changes nodes in the `Old City Reunion` Storyline draft and publishes it
- **THEN** Chara creates a new immutable CharacterStorylineVersion under the same CharacterStoryline identity
- **AND** the previous version and Conversations bound to it remain unchanged

### Requirement: Published StorylineVersion pins Character and node content

Each CharacterStorylineVersion SHALL pin one exact CharacterVersion plus its premise, constraints, ordered or graph relationships and immutable StorylineNode snapshots. Every node SHALL have stable identity within the Storyline and version-qualified content. Existing Narrative Conversations MUST retain their exact StorylineVersion/Node even after later publication.

#### Scenario: A later version edits the selected node

- **WHEN** an author publishes revised content for a node already used by a Narrative Conversation
- **THEN** the existing Conversation continues to resolve the old StorylineVersion node snapshot
- **AND** using the new node content requires an explicit new Conversation selection

### Requirement: StorylineNode owns authored narrative context constraints

Each StorylineNode SHALL define the author-reviewed narrative situation and MAY define time, location, Character state, relationship state, allowed story facts, forbidden story facts, authored narrative memories, knowledge boundary, behavior constraints and expression constraints. These fields SHALL be content of the immutable StorylineVersion and MUST NOT be populated from runtime transcript, CompanionMemory, external material or model output without a later explicit authoring review and publication.

#### Scenario: Current node hides a future revelation

- **WHEN** a Narrative turn is materialized at a node whose forbidden facts include a later revelation
- **THEN** the Character context contains the current situation and allowed predecessor background but omits the forbidden revelation and author-only notes
- **AND** the user-facing author Timeline may still show the complete structure according to its spoiler presentation policy

### Requirement: Storyline selection is explicit and version-exact

Character Entry SHALL present Storyline identity and node as the primary user choices while freezing the exact published StorylineVersion in the validated launch receipt. Agent MAY recommend eligible Storyline/Node candidates with reasons, but SHALL NOT bind one without user confirmation. A single unambiguous item MAY be visibly preselected by deterministic UI, but no active/recent/latest inference may become launch authority.

#### Scenario: Agent recommends two nodes

- **WHEN** user narrative intent matches two eligible StorylineNodes
- **THEN** Agent or the catalog presents both as non-authoritative recommendations and waits for explicit confirmation or free Narrative selection
- **AND** no Conversation or CharacterRun is created by recommendation alone

### Requirement: Runtime consumes Storyline as immutable context only

Narrative runtime SHALL read the exact selected StorylineVersion/Node and project its bounded Character context for each turn. Runtime MUST NOT create or mutate CharacterStorylineRun, Storyline transition, observation candidate, progress revision or authored node content. Conversation, Room, Experience, World, Save and branch SHALL NOT become Storyline authoring or progress authority.

#### Scenario: Dialogue appears to satisfy a node transition

- **WHEN** model output or user dialogue matches an authored successor condition
- **THEN** the current Narrative Conversation remains bound to its original node and StorylineVersion
- **AND** any proposed Storyline edit is only an authoring candidate requiring explicit draft update and publication

### Requirement: Storyline Timeline is a read-only projection

Chara SHALL project the exact StorylineVersion structure, selected node and node background for user inspection without claiming runtime completion or progress. Selecting another Timeline node SHALL only inspect it or initiate an explicit new Narrative Conversation; it MUST NOT mutate the active Conversation binding. The model context SHALL receive only the selected node's qualified narrative context, not the complete user Timeline.

#### Scenario: User clicks another node in an active narrative

- **WHEN** the user clicks a successor node in the Storyline Timeline
- **THEN** the UI shows node details and offers an explicit new-conversation action
- **AND** the active transcript, Character context and selected node remain unchanged

### Requirement: Room keeps personal storyline contexts separate

A Narrative Room MAY bind one optional exact StorylineVersion/Node per Character participant. Chara SHALL project per-participant Timeline identity and context without combining personal Storylines into a shared objective Room timeline. RoomEvent remains the sole Chara authority for shared Room messages and scheduling.

#### Scenario: Room participants inspect their story backgrounds

- **WHEN** a Narrative Room contains two Character participants with different StorylineNodes
- **THEN** the Workbench can switch or overlay their read-only personal Timeline projections with clear Character identity
- **AND** shared RoomEvent order remains separate from both Storyline structures

### Requirement: Storyline records fail locally

Invalid Storyline draft, publication, node or version binding SHALL remain visible with an exact owner-qualified diagnostic and disable only affected publication or Narrative launch. Chara MUST NOT select another StorylineVersion, rebuild missing nodes, downgrade to free Narrative or block valid sibling Storylines and Characters.

#### Scenario: Selected node is missing from one publication

- **WHEN** launch validation finds that a selected StorylineNode is unavailable in the exact StorylineVersion
- **THEN** that selection is rejected before Conversation creation with a node-qualified diagnostic
- **AND** other StorylineVersions, free Narrative and Companion remain available
