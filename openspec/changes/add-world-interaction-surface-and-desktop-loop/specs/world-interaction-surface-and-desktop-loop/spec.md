## ADDED Requirements

### Requirement: World UI is a projection and intent adapter

World Webview SHALL render package-owned projections and submit exact bound intents. It MUST NOT read workspace files, persist facts, infer active Run identity or retain hidden business Roots after scene exit.

#### Scenario: User leaves World Runtime

- **WHEN** Desktop transitions to another scene
- **THEN** the World Root and expensive presentation resources are released
- **AND** durable Saves and protected background runtime remain unchanged

### Requirement: Desktop preserves the package-owned path

Desktop SHALL authorize and delegate World operations through typed public ports and SHALL NOT implement World authoring, state transition, Save or branch policy.

#### Scenario: A stale intent reaches Main

- **WHEN** a Renderer submits an intent for a stale scene or Run identity
- **THEN** only that request is rejected with a visible diagnostic and sibling records remain usable
