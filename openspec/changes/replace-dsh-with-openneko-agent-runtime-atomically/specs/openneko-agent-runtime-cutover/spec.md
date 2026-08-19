## ADDED Requirements

### Requirement: Desktop SHALL have one OpenNeko Agent runtime

Desktop MUST execute Agent turns through the package-owned OpenNeko Agent application authority and its
single Pi runtime adapter. Production code and packaged resources MUST NOT register, launch, import or
route through DSH, ACP, a DSH profile, a reverse Host Tool, or a DSH-specific plugin.

#### Scenario: A user submits a turn

- **WHEN** the user submits from the canonical Agent composer
- **THEN** the exact Conversation-owned OpenNeko Agent runtime executes the turn
- **AND** no DSH process, ACP client or alternate Agent controller participates

#### Scenario: The canonical runtime dependency is missing

- **WHEN** Desktop cannot construct the required OpenNeko Agent runtime dependency
- **THEN** the affected Agent surface returns a typed unavailable diagnostic
- **AND** it does not launch DSH, select another runtime or fail the Window Shell startup

### Requirement: Domain capabilities SHALL use one exact composition path

Content, Generation, Canvas, Cut, Search and Automation capabilities MUST be contributed through their
owning public ports into the exact `CapabilityRegistryRuntime` and `ToolRegistry` path. A capability
failure MUST NOT switch domain owner, provider, runtime, source, Workspace or Project.

#### Scenario: A domain Tool executes

- **WHEN** an immutable turn snapshot contains an allowed exact domain Tool and owner binding
- **THEN** the Tool delegates to the owning domain public port
- **AND** tests can prove that exact provider was hit and no DSH/MCP wrapper/legacy Tool path participated

#### Scenario: A domain target is unavailable

- **WHEN** the Tool lacks its exact target, grant, provider, model or owner binding
- **THEN** only the current Tool call fails with an owner-qualified diagnostic
- **AND** sibling Tools, Conversations and Workspaces remain available
- **AND** active/current/recent identity and alternate provider/runtime fallback are not consulted

### Requirement: Skill and MCP SHALL remain bounded Agent extensions

Skill content MUST be selected through the Host-owned source/trust/catalog and loaded through the single
Pi SkillHost path. Explicitly configured MCP servers MUST register exact Tool identities through the single
Agent MCP manager. Neither path may become a second owner for OpenNeko domain behavior or reintroduce DSH.

#### Scenario: Exact Skill selection

- **WHEN** a turn selects a Skill by its complete Host identity and current fingerprint
- **THEN** Pi reads that Skill through the canonical SkillHost and records its receipt
- **AND** no activation protocol, DSH profile or fallback Skill source participates

#### Scenario: Duplicate MCP Tool identity

- **WHEN** two sources attempt to register the same exact Tool identity
- **THEN** registration fails visibly for the conflicting item
- **AND** unrelated registered Tools remain available

### Requirement: Desktop SHALL reuse the canonical Agent Webview

Desktop MUST compose the existing `@neko/agent-webview` public Root and typed Host protocol. It MUST NOT
replace or copy its composer, model selector, mode selector, context bar, transcript, Tool timeline, usage
or approval components into the Desktop application package.

#### Scenario: Agent surface is rendered

- **WHEN** an Agent Entry or Conversation scene is visible
- **THEN** the canonical Agent Webview renders the existing controls and presentation
- **AND** renderer code receives only bounded typed projections through preload

### Requirement: Unsupported records SHALL fail locally without data loss

Removing DSH MUST NOT delete or rewrite user data. A record that the canonical Agent authority cannot
decode MUST remain visible at its owning catalog boundary with an explicit diagnostic whenever that
catalog can enumerate it; it MUST NOT be opened by starting DSH, returning empty content, selecting a
different record, or failing Desktop bootstrap.

#### Scenario: One historical record is unsupported

- **WHEN** the catalog encounters one record whose transcript authority is not supported
- **THEN** that record is retained and its dependent actions are disabled with a diagnostic
- **AND** sibling records, Workspaces, Agent surfaces and the Window Shell remain usable

### Requirement: Verification SHALL prove the path, not only the result

Acceptance MUST include deterministic DSH absence/poison checks, exact capability provider evidence,
typed Desktop producer-consumer tests and the Agent Evaluation disposition. Key-free or mock results MUST
NOT be reported as real Agent behavior acceptance.

#### Scenario: Real provider acceptance is unavailable

- **WHEN** configuration, credentials, network, model access or cost authorization is unavailable
- **THEN** evidence records the exact `infrastructure-blocked` condition and unverified behavior
- **AND** direct runtime, mock output, dry-run or final text does not substitute for the missing run
