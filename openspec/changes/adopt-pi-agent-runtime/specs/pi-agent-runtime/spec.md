## ADDED Requirements

### Requirement: Pi is the single Agent execution path

The system MUST use a conversation-scoped Pi Agent for main-model streaming, tool scheduling, cancellation, steering, and follow-up execution. A successful turn MUST NOT invoke the legacy Executor, Platform chat adapter, Vercel AI SDK chat glue, or compatibility fallback.

#### Scenario: Stream a tool-using turn

- **WHEN** a configured conversation receives a user message that calls an available semantic tool
- **THEN** Pi streams the response, validates and executes the tool, records the result, and emits OpenNeko events carrying the conversation and turn identities

#### Scenario: Legacy path is poisoned

- **WHEN** the legacy Executor or chat-adapter entry point is configured to throw during a Pi-targeted turn
- **THEN** the turn still succeeds through Pi and the poisoned entry point is never called

### Requirement: Product boundaries remain OpenNeko-owned

The system SHALL keep Capability, MCP, permission, workspace trust, ResourceRef, creative Run/Task, package-owned apply, and host projection outside the Pi generic runtime.

#### Scenario: Permission denies a tool

- **WHEN** Pi proposes a tool call that OpenNeko permission or workspace-trust policy denies
- **THEN** the tool does not execute and Pi receives an explicit error result tied to the originating conversation and turn

#### Scenario: Long generation returns product identity

- **WHEN** a Pi tool submits a long-running media generation operation
- **THEN** it promptly returns an OpenNeko `TaskRef` while the product task runtime owns provider task identity, progress, cancellation, recovery, and final `ResourceRef`

#### Scenario: Project a domain tool name to the provider wire contract

- **WHEN** a registered OpenNeko tool identity contains characters or exceeds the length accepted by an OpenAI-compatible provider
- **THEN** the Pi boundary sends a stable distinct compatible wire name while permission, execution, diagnostics, and product events retain the original domain tool identity, and any collision or unknown wire name fails visibly

### Requirement: Conversation runtime state is isolated

Each active conversation MUST independently own one active Pi Agent, its active branch/session binding, abort state, queues, event subscription, and immutable in-flight turn snapshot. Historical and alternative branch/session mappings MUST remain product-owned and MUST NOT create a second simultaneously active Agent for the same conversation.

#### Scenario: Concurrent conversations

- **WHEN** two conversations execute concurrently with different model policies and one is cancelled
- **THEN** cancellation and events affect only the targeted conversation and neither runtime reads a global active-conversation model or queue

### Requirement: Runtime failures are visible

Unknown tools, invalid arguments, missing host requirements, cancelled work, provider failures, and unsupported runtime states MUST emit explicit diagnostics and MUST NOT be converted to empty or successful results.

#### Scenario: Invalid tool arguments

- **WHEN** Pi produces arguments that fail the registered semantic tool schema
- **THEN** execution is rejected with a diagnostic and the owning capability is not invoked

### Requirement: Pi Provider and Auth contracts are canonical for supported main models

For Pi-supported main/chat providers, the system MUST use Pi provider/model registration, credential interpretation, OAuth login/refresh/logout, and `CredentialStore` contracts. The legacy Platform provider/auth path MUST NOT provide fallback success.

OpenNeko SHALL own one program-level user CredentialStore shared by TUI and VS Code, durable credential persistence, deletion, provenance, redaction, Host-specific login interaction, and workspace/user configuration projection. Host-local login stores and Pi's default in-memory credential store MUST NOT act as production persistence. Secret values MUST NOT enter workspace facts, conversation SQLite, Pi Session, logs, or Evaluation facts.

#### Scenario: Refresh and persist an OAuth credential

- **WHEN** a Pi provider refreshes an expired OAuth credential
- **THEN** the refreshed value is written through the OpenNeko-owned `CredentialStore` adapter and a persistence failure is reported rather than presenting the credential as durably updated

#### Scenario: Run an API-key provider

- **WHEN** a configured Pi provider resolves an API key
- **THEN** Pi performs provider-specific authentication while OpenNeko preserves credential provenance and redacts the secret from diagnostics and projections

### Requirement: NewAPI remains supported without retaining the legacy chat path

Configured NewAPI/OneAPI-compatible endpoints, explicit protocol profiles, model catalogs, bearer credentials, and Neko account-gateway catalog/entitlement projections SHALL remain supported. Main/chat and bounded multimodal-understanding requests MUST use a Pi OpenAI-compatible provider/model projection. NewAPI-specific image, video, speech, music, and asynchronous task protocols SHALL remain in the owning OpenNeko media runtime and MUST NOT require the legacy Platform or Vercel AI SDK chat path.

#### Scenario: Use NewAPI for the main Agent model

- **WHEN** `agent.main` selects a configured NewAPI chat model
- **THEN** the runtime invokes Pi with the exact configured endpoint, model, credential source, and protocol compatibility, without invoking the legacy GenericAdapter or chat SDK path

#### Scenario: Use NewAPI for media generation

- **WHEN** a flat media purpose selects a configured NewAPI image, video, speech, or music model
- **THEN** the owning OpenNeko media executor uses the explicit NewAPI endpoint and returns evidence or `TaskRef` without changing the Pi main model or falling back to a chat adapter

#### Scenario: NewAPI configuration is incomplete

- **WHEN** the selected NewAPI purpose lacks its endpoint, credential, model, or required capability
- **THEN** resolution fails visibly without selecting another provider, account source, main model, or legacy adapter

#### Scenario: A CLI credential is scoped to the main provider

- **WHEN** `agent.main` and a media purpose select different providers and the CLI supplies one provider-agnostic API key
- **THEN** the key is projected only to the selected main provider and the media provider must resolve its own credential rather than inheriting that key

### Requirement: First-release OAuth scope is limited to actual Pi providers

The first migration MUST validate built-in Pi Provider OAuth and MAY validate Radius `/v1/oauth` discovery when Radius is actually configured. Arbitrary OAuth/OIDC endpoints MUST remain unsupported until a real provider contributes an explicit Pi `OAuthAuth` implementation and MUST NOT be represented as generically supported by endpoint configuration alone.

#### Scenario: Use a Radius-compatible gateway

- **WHEN** the configured gateway exposes the Pi Radius OAuth discovery contract
- **THEN** authentication obtains its authorization/token/device endpoints through that contract and persists the resulting credential through the OpenNeko store

#### Scenario: Configure an arbitrary OAuth endpoint without an auth implementation

- **WHEN** a provider supplies only authorization and token endpoint strings but no supported Pi provider or `OAuthAuth` implementation
- **THEN** provider registration fails visibly instead of silently using a generic OpenNeko auth fallback
