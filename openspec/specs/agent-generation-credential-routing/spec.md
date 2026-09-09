# agent-generation-credential-routing Specification

## Purpose

Keep generation credentials Host-owned while routing exact provider access into Agent generation without secret projection.

## Requirements

### Requirement: Agent generation uses typed defaults and the canonical credential authority

Agent generation policy SHALL map each requested operation to one flat default-model type binding and determine credential availability through the injected Host credential authority backed only by user configuration. Provider metadata MUST remain secret-free. Operation purposes SHALL NOT create another configuration or credential source.

#### Scenario: User configuration supplies the media credential

- **WHEN** the exact media Provider has a valid user-configuration API key and image model binding
- **THEN** Agent policy marks that exact purpose available through the Host credential authority
- **AND** no secret enters the turn contract, transcript, diagnostic, Webview state or model-policy snapshot

#### Scenario: A Provider credential is absent

- **WHEN** the exact Provider lacks a configured API key
- **THEN** its credential-dependent operation remains unavailable without reading another source
- **AND** unrelated Providers and operations remain usable

### Requirement: Agent Launch preserves generation capabilities

The Desktop Agent Launch adapter SHALL preserve the exact available model identity, category and operation capabilities from the package-owned Launch catalog when projecting Webview configuration. A configured default media selection SHALL resolve from the corresponding typed default on the first Draft submit.

#### Scenario: Assistant Draft uses the configured default image model

- **WHEN** the Launch catalog contains an available default image model with `text_to_image` capability
- **THEN** Desktop projects that capability to the Webview model option
- **AND** the first Assistant Draft submit carries the exact `image.generate` provider/model binding
- **AND** `GenerateImage` is registered for that Turn when the exact credential is available
- **AND** no model-category inference, historical Job, generated-file scan or active Workspace fallback participates

### Requirement: Missing generation credentials fail locally

An unavailable credential for one generation purpose SHALL NOT abort `agent.main`, unrelated Tools, sibling purposes, another Conversation or another Workspace. The affected required-purpose Tool SHALL remain unregistered and no provider request SHALL start for it.

#### Scenario: Ordinary message carries a default image model without its credential

- **WHEN** a user submits an ordinary greeting and the Draft carries an image-purpose model whose provider credential is unavailable
- **THEN** the chat turn continues through the configured `agent.main` model
- **AND** `GenerateImage` and the unavailable image provider are not invoked
- **AND** Workspace Tools and sibling capabilities remain usable

### Requirement: Media execution receives one ephemeral exact provider credential

The Host SHALL resolve the exact configured media provider through the canonical credential authority immediately before routing and provider execution, external-task observation or cancellation. Generation SHALL receive only an ephemeral execution provider, MUST NOT read credential storage directly and MUST NOT persist, log or project the secret.

#### Scenario: Agent generates an image with a configured credential

- **WHEN** an approved `GenerateImage` Tool submits a Job with an exact provider/model purpose binding
- **THEN** the Host resolves that provider's current credential and the canonical Generation execution uses the same provider/model
- **AND** the Job, artifact and Board projection contain no credential material
- **AND** no alternate provider, default model, direct-generation path or Canvas fallback participates

#### Scenario: Credential disappears before provider execution

- **WHEN** routing selected an exact provider but its credential is unavailable at execution time
- **THEN** the current Generation Job fails visibly before a provider request succeeds
- **AND** the runtime does not reuse a stale secret, recreate another owner or select another provider/model
