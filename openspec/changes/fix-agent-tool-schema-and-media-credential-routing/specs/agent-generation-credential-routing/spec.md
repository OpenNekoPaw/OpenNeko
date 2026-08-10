## ADDED Requirements

### Requirement: Agent generation purposes use the canonical credential authority

Agent generation-purpose policy SHALL determine provider credential availability through the injected CredentialStore authority. A valid configuration-file credential SHALL take precedence over an interactive auth-login credential, and Provider metadata MUST remain secret-free.

#### Scenario: Configuration file supplies the media credential

- **WHEN** the exact media provider has a valid configuration-file API key and an image model binding
- **THEN** Agent policy marks that exact image purpose available without reading `Provider.apiKey`
- **AND** no secret enters the turn contract, transcript, diagnostic, Webview state or model-policy snapshot

#### Scenario: Auth login supplies the media credential

- **WHEN** the configuration file has no credential and SecretStorage contains a valid interactive API-key credential for the exact media provider
- **THEN** Agent policy marks the exact image purpose available through the same CredentialStore path
- **AND** it does not add another credential source or change provider/model identity

### Requirement: Agent Launch preserves generation-purpose capabilities

The Desktop Agent Launch adapter SHALL preserve the exact available model identity, category and purpose capabilities from the package-owned Launch catalog when projecting Webview configuration. A configured default media selection SHALL produce the corresponding exact purpose binding on the first Draft submit.

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
