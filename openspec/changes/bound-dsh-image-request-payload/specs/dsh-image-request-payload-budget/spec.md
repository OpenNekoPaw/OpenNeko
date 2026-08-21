## ADDED Requirements

### Requirement: OpenNeko bounds active DSH image request payloads

Every OpenNeko-materialized `llm-pi-ai` provider route SHALL declare a 12 MiB maximum for base64-encoded image payload in one model request and SHALL rely on the DSH adapter's canonical oldest-first offload behavior when history exceeds that bound.

#### Scenario: image history fits the budget

- **WHEN** the current request's encoded image history is at most 12 MiB
- **THEN** DSH keeps those images in the provider request
- **AND** OpenNeko does not alter the durable Session or locators.

#### Scenario: image history exceeds the budget

- **WHEN** the current request's encoded image history exceeds 12 MiB
- **THEN** the DSH provider adapter offloads the oldest images until the request fits
- **AND** recent images remain eligible for the request
- **AND** the durable Session still retains every original image attachment.

#### Scenario: multiple provider routes are materialized

- **WHEN** OpenNeko projects more than one supported provider route
- **THEN** every route receives the same request image budget
- **AND** one unsupported provider remains a local diagnostic without removing valid sibling routes.
