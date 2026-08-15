## ADDED Requirements

### Requirement: Character Interaction uses bounded owner-qualified Workbench slots

Desktop SHALL compose Character Interaction through the existing controlled Workbench regions: Agent Interaction, one Main, one right manager, optional bottom Timeline and status. Main SHALL accept only an exact owner-qualified Character Presentation surface ref, the right manager SHALL accept only the matching Character Context/Participant projection, and bottom SHALL accept only exact Storyline and/or RoomEvent Timeline projections qualified for the same Conversation owner. Window layout SHALL store only presentation geometry and visibility; Character mode, Storyline selection, memory, participant state and provider facts MUST remain under their package owners.

#### Scenario: Narrative Dialogue is restored

- **WHEN** Desktop restores an exact Narrative Character Conversation
- **THEN** it composes the matching Agent Interaction, selected Presentation Main, Narrative Context Manager and Storyline Timeline refs without active/recent inference
- **AND** Window layout does not store or reconstruct CharacterVersion, StorylineVersion, node or transcript facts

#### Scenario: Character Workbench is narrow

- **WHEN** the Window cannot display interaction, Main and right manager at their minimum widths
- **THEN** Desktop applies one deterministic compact presentation that preserves a usable Main and explicit access to the hidden manager
- **AND** it does not duplicate Roots, move Character facts into layout or keep an off-screen business surface mounted

#### Scenario: One Character surface is invalid

- **WHEN** Main or a Timeline ref fails strict owner validation
- **THEN** only that surface reports a local diagnostic while valid sibling surfaces and the Conversation remain available
- **AND** Desktop does not substitute another provider, Character, Storyline node or Room projection
