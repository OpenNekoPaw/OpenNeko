## ADDED Requirements

### Requirement: Provider-expression DSL is absent from production contracts
The system MUST expose no `ProviderCard`, provider-expression profile descriptor, registry, router, fallback selection, prompt adaptation, Capability manifest kind, provider method, public export or runtime registration path. Provider and model selection SHALL use only the exact immutable Turn purpose model policy and the selected real provider adapter.

#### Scenario: Capability provider is registered
- **WHEN** a package contributes Agent capabilities
- **THEN** the canonical registry accepts only currently implemented contribution kinds and cannot declare or return a provider-expression profile
- **AND** no profile registry, router or fallback provider is invoked

#### Scenario: Turn selects a generation model
- **WHEN** an exact Turn requires image, video or audio generation
- **THEN** the owning purpose policy supplies one exact provider/model binding
- **AND** no Skill or removed expression profile can override, retry or replace that binding

### Requirement: Obsolete expression-profile configuration fails visibly and locally
The canonical AI and Host configuration shapes MUST NOT accept, emit or project `providerExpressionProfileId` or `provider_expression_profile_id`. Existing user configuration bytes SHALL remain unchanged; an affected model record MUST produce an explicit owning-boundary diagnostic and MUST NOT be interpreted as a Skill, prompt fragment, provider parameter or successful default.

#### Scenario: TOML contains the retired field
- **WHEN** one configured model contains `provider_expression_profile_id`
- **THEN** the Host configuration boundary rejects the obsolete field with a precise diagnostic and does not write the configuration
- **AND** unrelated user content and independently valid provider, model, Conversation, Workspace and Skill records remain available

#### Scenario: Canonical configuration is exported
- **WHEN** the Host exports or projects a valid provider/model configuration
- **THEN** the output contains only supported provider/model identity and parameters
- **AND** no provider-expression field or hidden compatibility marker is emitted

### Requirement: Creative expression guidance uses ordinary capability-neutral Skills
Reusable image, video and media-production expression guidance SHALL live in ordinary Pi-compatible Skill content and SHALL use the same discovery, exact activation and progressive-disclosure path as other builtin, personal, project and plugin Skills. Skill content MUST remain capability-neutral and MUST NOT contain provider/model identity, model override, provider routing, Tool protocol, configuration-field instructions or runtime authority.

#### Scenario: User asks for an expressive media result
- **WHEN** the Pi Skill catalog matches or the user explicitly invokes an applicable existing media Skill
- **THEN** the Skill guides the Agent to preserve and clarify subject, composition or camera, action or motion, style and light, audio or dialogue when relevant, duration, preservation and negative constraints
- **AND** execution still uses only capabilities and the provider/model snapshot already authorized for the exact Turn

#### Scenario: Required execution capability is absent
- **WHEN** Skill guidance describes an operation whose current Turn capability snapshot lacks an eligible Tool or provider binding
- **THEN** the request fails visibly or remains explicitly blocked
- **AND** Skill identity does not install, synthesize, select or fall back to a provider, model, Tool or alternate implementation

### Requirement: Live media intent parsing is private Tool behavior
The media generation Tool MAY parse provider-neutral creative intent into a bounded package-private structure, but that structure MUST NOT be exported as a ProviderCard/profile contract or contain provider fallback, registry, Skill activation or configuration migration semantics.

#### Scenario: Media Tool parses a structured prompt
- **WHEN** the Tool receives supported Markdown intent for an exact generation operation
- **THEN** it preserves the current operation, constraints and output request and executes through the already selected canonical capability
- **AND** no provider-expression profile identity or router participates

### Requirement: Retirement has deterministic and real-behavior evidence
Verification MUST prove path absence across production code, configuration, public exports, fixtures and Evaluation schemas. Because Skill selection and provider/model evidence can change Agent behavior, the owning Evaluation suite MUST record either a real complete Desktop-session result with exact Skill and effective model facts or an explicit infrastructure blocker; key-free or final-text-only output MUST NOT count as behavior acceptance.

#### Scenario: Deterministic retirement gates run
- **WHEN** contracts, Host, Agent runtime, builtin Skills and Evaluation schemas are validated
- **THEN** canonical paths pass and poison searches prove the deleted file, symbols, fields and contribution kinds cannot return success
- **AND** unrelated Skills and provider/model selection remain valid

#### Scenario: Real provider execution is unavailable
- **WHEN** credentials, configured model access or explicit cost authorization is missing
- **THEN** the Evaluation result records `infrastructure-blocked` with the unverified Skill-selection and effective-model behavior
- **AND** no mock, dry-run, key-free result or direct Turn runner is reported as real acceptance
