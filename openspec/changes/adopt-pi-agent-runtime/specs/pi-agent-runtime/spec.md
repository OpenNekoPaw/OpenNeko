## ADDED Requirements

### Requirement: Pi is the single Agent execution path

The system MUST use a conversation-scoped Pi Agent for main-model streaming, tool scheduling, cancellation, steering, and follow-up execution. A successful turn MUST NOT invoke the legacy Executor, Platform chat adapter, Vercel AI SDK chat glue, or compatibility fallback.

#### Scenario: Stream a tool-using turn

- **WHEN** a configured conversation receives a user message that calls an available semantic tool
- **THEN** Pi streams the response, validates and executes the tool, records the result, and emits OpenNeko events carrying the conversation and turn identities

#### Scenario: Attach a Webview while a turn is already streaming

- **WHEN** a retained Tab has no authoritative Timeline snapshot, or its installed snapshot does not yet contain an active assistant message/item already identified by shared Host state
- **THEN** the Tab withholds that non-Timeline active content, keeps a waiting projection, and renders it only after the Timeline-owned Markdown session is committed for the same conversation, message, and item identity

Active Webview Markdown streaming MUST be owned by the Tab Timeline projection and its normalized Markdown session registry. An empty or historical-only snapshot does not establish ownership of a newer active shared message. The registry commit MUST precede publication of the render projection. A Tab MUST NOT render active Markdown from shared message state, create a renderer-local streaming session, or fall back to a second stream path while the matching Timeline item is pending.

#### Scenario: Legacy path is poisoned

- **WHEN** the legacy Executor or chat-adapter entry point is configured to throw during a Pi-targeted turn
- **THEN** the turn still succeeds through Pi and the poisoned entry point is never called

### Requirement: Product boundaries remain OpenNeko-owned

The system SHALL keep Capability, MCP, permission, workspace trust, ResourceRef, creative Run/Task, package-owned apply, and host projection outside the Pi generic runtime.

#### Scenario: Permission denies a tool

- **WHEN** Pi proposes a tool call that OpenNeko permission or workspace-trust policy denies
- **THEN** the tool does not execute and Pi receives an explicit error result tied to the originating conversation and turn

#### Scenario: Ask mode presents a non-read Tool confirmation

- **WHEN** a non-read Tool in `ask` mode requires confirmation while its ToolCall projection is being published
- **THEN** the same Timeline-owned tool item records the pending confirmation and the Webview renders approve/reject controls before execution; confirmation delivery MUST tolerate asynchronous event completion order and MUST NOT depend on a parallel Webview-only message arriving after the ToolCall

The confirmation wait MUST remain correlated to the originating conversation and ToolCall, and cancellation or a bounded confirmation timeout MUST fail visibly without executing the Tool. A missing or detached Webview confirmation projection MUST NOT leave the turn waiting indefinitely.

#### Scenario: Read authorized internal or workspace information

- **WHEN** Pi proposes a Tool classified as read-only for trusted internal content or content already authorized inside the current workspace
- **THEN** `ask` and `auto` modes execute the read without user confirmation, while path containment, workspace trust, and content-access checks remain enforced

Permission interaction MUST follow operation risk rather than the existence of a Tool call. An explicitly confirmation-gated Tool MUST still request approval, `plan` mode MUST NOT execute Tools, and a non-read Tool in `ask` mode MUST NOT inherit the read-only exemption. TUI and VS Code MUST consume the same read-only/confirmation decision contract.

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

#### Scenario: Reject an incomplete document chapter locator

- **WHEN** Pi calls `ReadDocument` range mode with a chapter locator that contains `spineIndex` but omits the required `chapterHref`
- **THEN** the registered discriminated locator schema rejects the call before ContentAccess or the EPUB reader runs and reports the missing semantic locator contract

#### Scenario: Project a Pi tool failure to product Hosts

- **WHEN** Pi reports a failed Tool result whose diagnostic is present in result content while structured details are empty
- **THEN** the Pi event boundary preserves that diagnostic as a failed product Tool result for TUI and VS Code, and neither Host receives empty data with a generic replacement error

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

#### Scenario: Materialize a completed NewAPI image through the provider boundary

- **WHEN** a NewAPI image generation endpoint completes with inline base64 bytes or a result URL
- **THEN** the owning NewAPI image provider decodes or downloads the result before returning to the media task runtime, and the successful path does not depend on a generic SDK performing an unauthenticated or detached fetch of a temporary output URL

The request MUST NOT force optional response-format parameters that the configured OpenAI-compatible image channel does not support. The provider-owned download path MUST preserve required same-origin authentication without forwarding credentials across origins, enforce transport and bounded image validation, and fail with the output URL origin plus transport cause without logging credentials or signed query values. It MUST NOT silently submit the generation operation again merely because output materialization failed.

#### Scenario: NewAPI closes a synchronous image request after provider submission

- **WHEN** the NewAPI image generation POST loses its connection before a response or recoverable external task identity is received
- **THEN** the media task fails visibly as an outcome-unknown, non-retryable operation, reports that provider completion or charging may already have occurred, and does not automatically resubmit the generation request

The diagnostic SHOULD identify the gateway relay-timeout boundary without exposing credentials. Recovery requires a provider task identity, a provider-side result lookup, or gateway configuration that permits the synchronous request to complete; OpenNeko MUST NOT claim that a newly submitted generation is a retry of the original result.

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
