## ADDED Requirements

### Requirement: Playable Canvas nodes expose sequence connection endpoints

Every Canvas node that can become a playback unit SHALL expose a stable incoming and outgoing sequence connection affordance. Media nodes MUST retain the existing `out` endpoint identity and MUST also provide an incoming target. These sequence affordances MUST remain distinct from persisted Canvas selection and MUST NOT change node dimensions.

#### Scenario: Two Media nodes are available

- **WHEN** the Canvas renders two Media nodes
- **THEN** each node exposes an outgoing sequence source and an incoming sequence target
- **AND** either node can become the predecessor or successor

#### Scenario: Existing Media endpoint is loaded

- **WHEN** an existing connection references the Media `out` port
- **THEN** the endpoint continues to resolve to the right side of the same node
- **AND** adding the incoming target does not rewrite the persisted connection

### Requirement: Sequence drag accepts compatible handles and node cards

The Canvas SHALL start a sequence authoring session from an outgoing affordance. During that session it SHALL resolve a compatible incoming handle or another node card as the target, SHALL visibly distinguish valid and invalid targets, and SHALL cancel when the pointer is released over blank Canvas.

#### Scenario: User drops on an input handle

- **WHEN** the user drags from node A's outgoing affordance to node B's incoming handle
- **THEN** Canvas submits one sequence connection from A to B
- **AND** the pointer preview is cleared

#### Scenario: User drops on a target card

- **WHEN** the user drags from node A's outgoing affordance and releases over node B's card
- **THEN** Canvas snaps to B's incoming node endpoint
- **AND** submits one sequence connection from A to B

#### Scenario: User drops on blank Canvas

- **WHEN** an active connection gesture ends without a compatible target
- **THEN** Canvas cancels the gesture
- **AND** no connection or history entry is created

### Requirement: Connection mutation uses one validated canonical path

Creating or updating a Canvas connection SHALL validate endpoint existence, direction, compatibility, duplicates, self-links, capacity and disallowed cycles before mutating document state. Pointer state MUST have one Webview owner and MUST NOT be duplicated in the document Store. A rejected user operation MUST return a stable visible reason instead of appearing successful.

#### Scenario: Valid sequence is committed

- **WHEN** A and B exist and A-to-B does not duplicate an edge or form a disallowed cycle
- **THEN** exactly one `sequence` connection is added
- **AND** exactly one history/dirty mutation is recorded

#### Scenario: Output is dropped on output

- **WHEN** a port-scoped gesture attempts an output-to-output connection
- **THEN** the target is marked invalid
- **AND** the document remains unchanged

#### Scenario: Connection type update creates a cycle

- **WHEN** changing an existing `reference` connection to `sequence` would create a directed cycle
- **THEN** the update is rejected with a stable reason
- **AND** the original connection remains unchanged

#### Scenario: User creates a branch or merge

- **WHEN** valid sequence connections give a node multiple successors or multiple predecessors
- **THEN** all valid node-scoped sequence connections are retained
- **AND** data-port single-input capacity does not reject the Storyline merge

### Requirement: Storyline reflects only authored sequence topology

The generic Canvas playback adapter SHALL derive transitions and route candidates only from enabled `sequence` connections and explicitly sequential Group child order. Canvas array order, spatial position, labels and current selection MUST NOT create Storyline edges. Disconnected components and isolated playable nodes SHALL remain distinct.

#### Scenario: Playable nodes are disconnected

- **WHEN** a Canvas contains playable A, B and C without sequence facts
- **THEN** Storyline exposes A, B and C without connectors
- **AND** it does not create synthetic A-to-B or B-to-C transitions

#### Scenario: Two independent sequences exist

- **WHEN** the Canvas contains A-to-B and C-to-D sequence connections
- **THEN** Storyline displays two independent components
- **AND** it does not create a B-to-C connector

#### Scenario: Authored branch and merge exists

- **WHEN** sequence connections define A-to-B, A-to-C, B-to-D and C-to-D
- **THEN** Storyline displays the authored branch and merge
- **AND** every displayed connector maps to an explicit or sequential-Group transition

#### Scenario: Current Canvas selection changes

- **WHEN** the selected Canvas node changes without changing sequence facts
- **THEN** Storyline topology remains unchanged
- **AND** only current route or unit focus may change

### Requirement: Connection and Storyline interaction is keyboard and runtime observable

Connection affordances and rejection feedback SHALL have accessible labels. The Extension Development Host scenario SHALL prove that a real Canvas Webview can create a Media-to-Media sequence connection and that the Storyline projection updates without Webview console errors.

#### Scenario: Real Webview creates Media sequence

- **WHEN** the functional Canvas fixture is opened in an isolated Extension Development Host and a Media output is dragged to another Media target
- **THEN** the Canvas connection count increases by one
- **AND** the persisted connection type is `sequence`
- **AND** Storyline displays the corresponding connector

### Requirement: Storyline keeps multiple branch lanes visible

The collapsed Storyline Overlay SHALL reserve enough responsive height to show at least two complete graph lanes in a constrained host and approximately three graph lanes at a normal desktop height. The graph viewport SHALL remain the existing horizontal and vertical scroll owner when topology exceeds the visible area. Storyline height MUST NOT grow with the total branch count or move scrolling to the playback controls or Preview.

#### Scenario: Storyline contains several branch lanes

- **WHEN** authored topology lays out three or more graph lanes
- **THEN** the collapsed Overlay exposes two to three lanes at once according to available host height
- **AND** additional lanes remain reachable through the existing Storyline viewport scrolling
- **AND** playback controls and Preview stay outside that scrolling region
