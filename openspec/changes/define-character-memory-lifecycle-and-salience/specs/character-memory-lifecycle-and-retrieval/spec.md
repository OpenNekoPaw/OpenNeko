## ADDED Requirements

### Requirement: Conversation memory scope is explicit and immutable

Every conversation MUST bind exactly one explicit memory scope at creation:
`workspace`, `narrative`, or `companion`. `workspace` MUST remain an Agent conversation scope and
MUST NOT become a CharacterRuntimeKind. The scope and its required owner identities MUST remain
immutable for the conversation lifetime; missing, stale, or mismatched identity MUST fail visibly
without falling back to active UI state.

#### Scenario: Workspace Agent discusses a character

- **WHEN** a workspace-scoped Agent conversation analyzes or simulates a project character
- **THEN** its transcript and memory proposals remain bound to the explicit workspace owner
- **AND** the conversation does not become a narrative or companion CharacterRun

#### Scenario: Conversation scope identity is incomplete

- **WHEN** a narrative turn omits its save, branch, checkpoint, or actor identity
- **THEN** the runtime rejects the turn with a typed diagnostic
- **AND** it does not infer identity from the active tab, selected character, recent save, or workspace

### Requirement: Workspace conversations do not enter character memory

OpenNeko SHALL keep workspace-scoped transcript, project decisions, user working preferences and
project-memory proposals owned by AgentSession and Workspace Memory. They MUST NOT automatically
enter CharacterVersion, NarrativeSave, UserCharacterRelationship or a Character memory index.
Transferring a workspace insight into character authoring MUST use an explicit CharacterProject
review candidate with source provenance.

#### Scenario: Workspace conversation discovers a character inconsistency

- **WHEN** an Agent identifies a possible character-profile improvement in workspace chat
- **THEN** the insight may be proposed to CharacterProject review with explicit source identity
- **AND** no published character, narrative save or companion relationship is mutated

#### Scenario: Workspace memory is semantically similar to relationship memory

- **WHEN** Workspace Memory contains a preference semantically similar to a companion-memory query
- **THEN** companion recall excludes the workspace record
- **AND** vector similarity does not authorize cross-scope transfer

### Requirement: Narrative dialogue is committed by the save owner

Narrative dialogue and user interaction MUST become story facts only through a revisioned
NarrativeSave/WorldSave event committed by the authoritative save owner. A committed event MUST
identify its save, branch, event, checkpoint or narrative time, actor or speaker, participant and
observation scope, source turn, CharacterVersion binding and committed revision. Provider output,
streamed text or Agent transcript alone MUST NOT prove that a narrative event occurred.

#### Scenario: Narrative response commits successfully

- **WHEN** a narrative response passes actor, rule, scope and expected-revision validation
- **THEN** the save owner atomically commits a NarrativeDialogueEvent and advances the save revision
- **AND** the committed event becomes eligible for an authorized actor-memory view

#### Scenario: Narrative save commit fails

- **WHEN** the model produces a response but the save owner rejects its stale expected revision
- **THEN** the response remains failed or provisional and does not become a story fact
- **AND** later narrative recall cannot retrieve it from Agent transcript

### Requirement: Narrative memory follows branch, time and actor knowledge

The save owner MUST filter narrative memory by save identity, branch ancestry, checkpoint or
timepoint, event revision and actor observation/knowledge scope before any lexical, vector,
density, salience or summarization operation. Continuing from an earlier checkpoint MUST create a
new branch instead of rewriting the old causal history.

#### Scenario: User continues from an earlier checkpoint

- **WHEN** the user selects a checkpoint before a later dialogue and continues the story
- **THEN** the save owner creates a new branch sharing only the reachable ancestor events
- **AND** the new actor-memory view excludes dialogue unique to the old future branch

#### Scenario: High-salience event is outside actor knowledge

- **WHEN** an emotionally intense or narratively central event was not observed by the actor
- **THEN** the event is excluded before salience scoring
- **AND** its importance cannot override the actor knowledge boundary

### Requirement: Companion transcript and accepted relationship memory are distinct

OpenNeko SHALL keep Companion AgentSession transcript evidence distinct from structured records
accepted by the UserCharacterRelationship owner. Transcript MAY remain durable according to
retention policy, but only accepted records MUST enter the cross-session RelationshipMemoryView.
Ending, compacting or deleting an AgentSession MUST NOT silently mutate accepted relationship
memory, and searchable transcript text MUST NOT be treated as accepted fact.

#### Scenario: Daily conversation contains ordinary small talk

- **WHEN** a CompanionRun records ordinary conversation that produces no accepted memory candidate
- **THEN** the transcript may remain available under its retention policy
- **AND** the small talk does not become a durable relationship fact merely because it is searchable

#### Scenario: User explicitly asks the character to remember

- **WHEN** the user asks the companion character to remember a non-sensitive stable preference
- **THEN** the run creates a source-linked high-priority memory candidate
- **AND** relationship policy decides whether it enters an accepted revision

### Requirement: Relationship memory uses explicit kinds and lifecycle

Relationship memory MUST use a bounded discriminated record model for user facts, preferences,
boundaries, agreements, shared episodes and relationship milestones. Candidates and records MUST
follow explicit `proposed`, `accepted`, `quarantined`, `rejected`, `superseded` and `deleted`
semantics. Reminder, Task and Activity state MUST remain owned by their domains and MAY appear only
as authorized stable references or summarized shared experiences.

#### Scenario: New memory conflicts with a published character version

- **WHEN** a candidate conflicts with the relationship's newly bound CharacterVersion canon
- **THEN** the relationship owner quarantines it for explicit review
- **AND** it does not silently override the version or enter ordinary recall

#### Scenario: User corrects a remembered fact

- **WHEN** the user corrects an accepted relationship memory
- **THEN** the owner commits a new revision linked by supersession provenance
- **AND** the superseded value immediately exits ordinary recall

#### Scenario: Candidate contains a credential

- **WHEN** a companion candidate contains a credential or private temporary access value
- **THEN** the relationship owner rejects the sensitive payload
- **AND** no rejected record, summary or index preserves the secret value

### Requirement: Relationship records retain provenance, policy and temporal semantics

Every accepted relationship memory MUST retain stable memory, relationship and local-user
identities; a discriminated kind; normalized content; stable source refs; occurrence and validity
time; sensitivity and retention class; acceptance source; status and relationship revision; and
the CharacterVersion binding under which it was created. Derived scores MUST NOT replace these
facts.

#### Scenario: Memory is inspected by the user

- **WHEN** the user opens an accepted relationship memory
- **THEN** the system can present its meaning, source, time, acceptance reason and current status
- **AND** it does not expose provider objects, credentials, temporary URLs or host-private handles

#### Scenario: Source evidence is unavailable

- **WHEN** a candidate lacks the stable source required by its acceptance policy
- **THEN** the relationship owner rejects or quarantines the candidate with a diagnostic
- **AND** it does not create an untraceable accepted fact

### Requirement: Memory density is an optional derived multi-axis projection

The Character memory contract MUST allow an implementation to omit memory-density calculation.
When temporal, spatial or narrative density is calculated, it MUST consume only an
owner-authorized snapshot and MUST remain a revisioned, rebuildable projection. Density MAY
control aggregation, summary granularity, redundancy suppression and recall diversity, but MUST
NOT establish truth, expand visibility, increase confidence by itself, override explicit user
importance or directly delete a memory. The initial implementation MUST NOT require
kernel-density estimation, continuous-distribution fitting or graph-centrality infrastructure to
satisfy this capability.

#### Scenario: Initial implementation has no density estimator

- **WHEN** eligible memory can be selected with hard scope filters, structured fields and explainable salience evidence
- **THEN** the implementation may return a valid MemoryView without a density feature
- **AND** it does not fabricate a default density value or fail an otherwise valid recall

#### Scenario: Dense low-salience companion episodes

- **WHEN** many low-salience accepted episodes describe the same activity period
- **THEN** Memory infrastructure may produce a source-linked derived theme summary and suppress redundant recall
- **AND** the density does not promote every episode to a high-importance memory

#### Scenario: Sparse user-pinned memory

- **WHEN** a user explicitly pins a unique event with low temporal and topic density
- **THEN** retention and recall policy preserve it as an anchor memory
- **AND** low density does not cause automatic deletion

#### Scenario: Narrative density calculation

- **WHEN** Memory infrastructure calculates density for a narrative actor at a checkpoint
- **THEN** it consumes only the save owner's branch- and knowledge-filtered snapshot
- **AND** events from another branch or hidden scene do not affect density values

### Requirement: Spatial density respects domain identity and privacy

Narrative spatial density MUST use explicit scene, place or region identity supplied by the
World/Narrative owner. Companion spatial density MUST use only user-authorized coarse place
identity and MUST NOT infer or persist precise location history by default. Text similarity alone
MUST NOT establish spatial co-location.

#### Scenario: Narrative events share a scene

- **WHEN** authorized narrative events reference the same stable scene identity
- **THEN** the density projection may group them for scene-level recall or summarization
- **AND** it does not group unrelated events solely because their dialogue uses similar place words

#### Scenario: Companion activity exposes precise location

- **WHEN** an Activity observation includes a precise device location without relationship-memory authorization
- **THEN** Chara excludes the location from durable memory and density projection
- **AND** it may retain only an authorized coarse place or no place information

### Requirement: Salience is explainable and mode-specific

Memory salience MUST be represented by explainable intrinsic and structural evidence rather than
a single authoritative importance value. User-explicit importance, event consequence and
authorized emotional evidence MAY be retained with provenance; novelty, independent repetition
and explicit connectivity MUST remain derived features. Workspace, narrative and companion
retrieval MUST use separate mode-specific salience projections. An implementation MAY use
rule-based projection and MAY omit unavailable factors, but it MUST preserve the evidence used to
explain retention, consolidation or recall priority.

#### Scenario: Implementation wants one persistent importance score

- **WHEN** a storage design proposes replacing salience evidence with a single durable importance value
- **THEN** the Character memory contract rejects the value as the authoritative salience representation
- **AND** mode-specific recall derives its decision from source-linked evidence instead

#### Scenario: Model finds an event surprising

- **WHEN** a model describes an event as surprising without an authoritative state change or user evidence
- **THEN** the statement does not create durable novelty or importance evidence
- **AND** it cannot promote the event by itself

#### Scenario: Topic is independently repeated

- **WHEN** the user independently confirms the same preference across multiple source turns
- **THEN** the derived repetition feature may increase with a capped or saturating policy
- **AND** model restatements in the same turn do not count as independent evidence

#### Scenario: Memory is a highly connected narrative anchor

- **WHEN** an authorized event has explicit links to several arcs, actors or state transitions
- **THEN** narrative retrieval may apply a bounded connectivity boost
- **AND** recall frequency itself does not create new links or permanently increase salience

### Requirement: Emotional valence and intensity remain distinct

Emotional evidence MUST distinguish directional valence from arousal or intensity. Recall policy
MUST NOT treat negative valence as inherently more important than positive memories, user
boundaries or current task relevance. In companion mode, inferred health, trauma, identity or
private emotional state MUST NOT be automatically accepted as durable memory.

#### Scenario: Negative event has high emotional intensity

- **WHEN** an accepted event has negative valence and high authorized emotional intensity
- **THEN** retrieval may consider its intensity and consequence under bounded policy
- **AND** negative direction alone does not force repeated recall

#### Scenario: Model infers a sensitive emotional condition

- **WHEN** the companion model infers a sensitive condition that the user did not explicitly state
- **THEN** the system rejects or quarantines the candidate according to privacy policy
- **AND** the inference does not become an accepted user fact

### Requirement: Task relevance is recall-time context only

Current query, task, scene and goal relevance MUST be calculated for the current recall request and
MUST NOT mutate durable salience, relationship facts or narrative events. Changing tasks MUST
produce a new contextual projection over the same owner revision.

#### Scenario: User changes companion topic

- **WHEN** the user moves from choosing a movie to discussing breakfast
- **THEN** the recall projection recalculates task relevance for the new topic
- **AND** prior movie memories do not retain a permanent importance boost from the old task

#### Scenario: Narrative goal changes

- **WHEN** a committed story event closes one goal and opens another
- **THEN** the next actor-memory view uses the new save revision and goal context
- **AND** the previous contextual ranking is not written back to save events

### Requirement: Recall applies hard eligibility before soft ranking

Every recall MUST first resolve the explicit owner identity and authoritative revision, then apply
user, relationship, save, branch, timepoint, actor knowledge, accepted status, version
compatibility, permission, sensitivity and retention eligibility as applicable. Only the eligible
set MAY be ranked by lexical or vector relevance, density, salience, recency, contextual relevance
and redundancy under an explicit item/token budget.

#### Scenario: Ineligible memory has a perfect vector match

- **WHEN** a memory from another relationship or narrative branch has the highest semantic similarity
- **THEN** hard scope filtering excludes it before ranking
- **AND** no score or fallback can reintroduce it

#### Scenario: Authorized memory set is empty

- **WHEN** owner resolution succeeds but no memory is eligible for the current view
- **THEN** the system returns a valid empty MemoryView with the resolved owner revision
- **AND** it does not substitute workspace, transcript, another mode or another version memory

#### Scenario: Required owner or index fails

- **WHEN** owner resolution, revision validation or a contractually required index fails
- **THEN** recall returns a typed diagnostic
- **AND** it does not present the failure as empty-memory success or silently select another retriever

### Requirement: Consolidation preserves anchors and source provenance

Consolidation MUST distinguish density from salience. Dense low-salience memories MAY be represented
by derived summaries; dense high-salience clusters MUST retain bounded anchor events and source
refs; sparse high-salience memories MUST remain independently retrievable. Automatic summaries
MUST remain derived until explicitly accepted by the owning aggregate.

#### Scenario: Dense high-salience shared experience

- **WHEN** a long companion activity contains many events and several user-important anchors
- **THEN** consolidation produces a bounded summary while preserving the important source-linked anchors
- **AND** the summary does not erase the user's explicit importance evidence

#### Scenario: Derived summary contains an error

- **WHEN** an automatically generated summary contradicts its accepted source records
- **THEN** rebuilding or removing the derived summary leaves authoritative memories unchanged
- **AND** the erroneous summary cannot become a relationship fact without explicit acceptance

### Requirement: Deletion and correction invalidate every derived projection

Deleting or superseding a relationship memory MUST advance the owner revision and invalidate every
full-text, vector, summary, density, salience and graph projection derived from the prior record.
Index results MUST identify their source owner revision, and consumers MUST reject stale results.
Deletion tombstones MUST NOT retain recoverable sensitive content.

#### Scenario: Deleted memory exists in a stale vector index

- **WHEN** a recall receives an index result built from a relationship revision before deletion
- **THEN** the consumer rejects the stale result and requests or waits for an authorized projection
- **AND** the deleted memory is not injected into Agent context

#### Scenario: User deletes the only memory in a topic

- **WHEN** the relationship owner deletes the final accepted record supporting a derived topic summary
- **THEN** the owner revision advances and the summary and density projection become invalid
- **AND** an identity-only tombstone cannot reconstruct the deleted content

### Requirement: Existing memory mechanisms are not Character memory authority

OpenNeko SHALL treat Workspace `.neko/memory.md`, keyword MemoryRecall, Pi
transcript/compaction, SharedMemoryStore and legacy `character-memory.json` as non-authoritative for
Character relationship and narrative memory. A future implementation MUST introduce the explicit
owner contracts in this capability and MUST define migrate, review/import, rebuild, ignore or
reject behavior for legacy data without dual-read, dual-write or silent fallback.

#### Scenario: Character memory implementation is unavailable

- **WHEN** the explicit NarrativeSave or UserCharacterRelationship memory owner has not been implemented
- **THEN** the corresponding Character memory path remains unavailable with a diagnostic
- **AND** the system does not report success by reading project memory or Agent compaction

#### Scenario: Legacy character memory file is present

- **WHEN** a workspace contains `neko/character-memory.json`
- **THEN** the new runtime follows an explicitly designed migration or rejection path
- **AND** file presence alone does not authorize automatic import into a relationship or save
