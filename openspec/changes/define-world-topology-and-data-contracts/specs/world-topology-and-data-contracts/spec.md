## ADDED Requirements

### Requirement: World capability owners use one canonical contract each

World Definition, World Story and World Experience SHALL expose distinct package-owned canonical contracts and exact immutable references. They MUST NOT share a mutable aggregate, use internal contract generations, or resolve dependencies through active/latest identity.

#### Scenario: Experience references Character and Story

- **WHEN** an Experience composition binds World, World Story and Character content
- **THEN** it stores exact owning-domain immutable refs without copying or mutating another owner's facts

### Requirement: Invalid records fail locally

Each contract decoder SHALL reject only the malformed record with an owner-qualified diagnostic while valid sibling records and unrelated capabilities remain available.

#### Scenario: One actor binding is malformed

- **WHEN** one actor binding has an invalid CharacterVersion reference
- **THEN** that binding is unavailable and sibling World records remain readable
