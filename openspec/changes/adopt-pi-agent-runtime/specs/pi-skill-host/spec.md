## ADDED Requirements

### Requirement: Pi Skill primitives are canonical
The system MUST use Pi `Skill`, discovery, sourced loading, invocation formatting, and system-prompt formatting as the canonical `SKILL.md` parsing and progressive-disclosure path.

#### Scenario: Discover Skill roots
- **WHEN** builtin, project, and personal Skill roots contain valid `SKILL.md` files
- **THEN** Pi discovery returns a unified catalog and OpenNeko records source, trust, enablement, and fingerprint without creating a second Skill definition

#### Scenario: Resolve duplicate Skill names
- **WHEN** a project Skill has the same name as another discovered source
- **THEN** the project record is selected, every shadowed record remains separate, and the Host emits a warning without merging content or failing the catalog

### Requirement: Skill trust and enablement are Host facts
Only trusted and enabled Skill records SHALL be eligible for full-content injection. Skill metadata MUST NOT grant tools, permissions, workspace trust, model overrides, or executable workflow authority.

#### Scenario: Reject an untrusted explicit Skill
- **WHEN** a user explicitly invokes an untrusted or disabled `$skill-name`
- **THEN** the target turn fails visibly or reports the unavailable Skill and no content, tool permission, or model change is injected

#### Scenario: Preserve allowed-tools as non-authoritative metadata
- **WHEN** a Skill declares experimental `allowed-tools`
- **THEN** the field may be retained for metadata but the actual Tool registry and permission decision remain unchanged

### Requirement: Skill paths are opaque runtime locators
Before Skill metadata or full content is formatted for the model, the Skill Host MUST replace physical `Skill.filePath` values with a process-local fingerprint-addressed `SkillLocator`. Cross-session locator stability MUST NOT be required. Only the Skill Host SHALL resolve that locator to trusted content or a Host path.

`SkillLocator` MUST NOT be persisted, passed to `PathResolver`, ContentAccess, or `ResourceCacheService`, or treated as a workspace-relative path, `${VAR}` path, `ResourceRef`, cache key, cache-relative path, or Webview URI. One designated Agent content-read boundary MAY recognize the Skill namespace and MUST delegate resolution to Skill Host. Relative references, assets, and scripts MUST remain contained under the same virtual Skill root. Transparent resource caching SHALL remain exclusively behind `ResourceRef`; the Skill Host MUST NOT add a general virtual filesystem or parallel resource cache.

#### Scenario: Format a Skill without leaking physical paths
- **WHEN** Pi formats a builtin, project, or personal Skill catalog entry or invocation
- **THEN** the model sees only the opaque Skill locator and no absolute Host path, physical cache path, or project-persisted locator

#### Scenario: Reject non-Host locator resolution
- **WHEN** a non-designated file/content/cache path attempts to consume a Skill locator
- **THEN** resolution fails visibly and only the designated Agent read boundary can delegate to Skill Host after trust, enablement, containment, and permission checks

### Requirement: Explicit and model-selected Skill invocation share one Host record
Explicit `$skill-name` MUST resolve the project-first trusted/enabled record and inject its full content for the target turn without model selection. Model-selected progressive disclosure MUST expose only eligible catalog metadata/location and load content through the Skill virtual namespace. A disabled-model-invocation Skill MUST remain available only to explicit invocation.

#### Scenario: Explicitly invoke a Skill
- **WHEN** the user invokes a trusted enabled `$skill-name`
- **THEN** the Host resolves the selected fingerprint and Pi formats full content for that turn without requiring a model file-read decision

#### Scenario: Model selects a Skill
- **WHEN** the model determines that an eligible catalog entry applies
- **THEN** it reads the virtual `SKILL.md` through the designated read-only boundary without entering user confirmation, and relative resources remain scoped to that fingerprint root

#### Scenario: Skill changes between turns
- **WHEN** a Skill fingerprint changes while a turn is active
- **THEN** the active turn keeps its captured record and the next turn uses the new record without pinning the conversation to the previous fingerprint

### Requirement: Skill script execution uses product permission and processor boundaries
Skill scripts MAY execute only through user/workspace allow/ask/deny policy, workspace trust, and the canonical External Processor, PathAccessPolicy, sandbox, and ResourceRef contracts. Skill content and metadata MUST NOT grant execution authority or expose arbitrary shell access. Reusable approval MUST be scoped at least by workspace, Skill fingerprint, and script/processor identity.

#### Scenario: Execute an approved Skill script
- **WHEN** a trusted enabled Skill requests a script whose scoped policy permits execution
- **THEN** the Host resolves the virtual resource, runs it through the registered processor/sandbox, and returns ResourceRef/provenance/diagnostics without exposing a physical command path

#### Scenario: Skill fingerprint invalidates approval
- **WHEN** an approved Skill or script changes fingerprint
- **THEN** the previous approval does not authorize execution and the configured ask/deny policy is applied again

### Requirement: Skill injection is turn-scoped
Explicit or progressively disclosed Skill content MUST create no persistent activation/lifecycle state beyond the intended turn unless a separate future conversation setting is explicitly designed. Content actually sent to the model or returned as a content-read tool result MUST remain in Pi transcript history as the real model input for reopen, branch, and context construction.

#### Scenario: Invoke a Skill for one turn
- **WHEN** `$skill-name` selects a trusted enabled Skill
- **THEN** Pi formats its content for that turn and subsequent turns do not retain legacy activation slots, ToolGuard state, ToolSet mutations, or Skill model overrides

### Requirement: Model-selected Skill use exposes a receipt, not activation state
Every successful Pi `read_skill` result MUST carry the Host-owned Skill name, source, content fingerprint, and opaque locator identity in Pi transcript history. TUI debug automation SHALL project a bounded, redacted receipt containing the ToolCall identity, name, source kind, normalized fingerprint, and locator class. It MUST NOT project a physical path, raw locator value, raw Skill content, activation status, injected-fragment lifecycle, ToolGuard state, or cache identity.

#### Scenario: Evaluate a model-selected Skill read
- **WHEN** Pi successfully reads a trusted enabled Skill through `read_skill`
- **THEN** Agent Evaluation observes the matching `skillReceipts` fact and proves the real receipt identity without consulting a `skillActivations` compatibility field or final-answer text

#### Scenario: Skill receipt evidence is truncated or malformed
- **WHEN** the bounded receipt projection drops a record or the Tool result lacks the required receipt contract
- **THEN** the Skill hard gate fails visibly and does not infer Skill use from Tool name, prompt text, or model output

### Requirement: Skill Host adds no independent cache authority
The Pi-loaded/Host catalog fingerprint snapshot MAY be reused within the current process. The system MUST NOT add a separate Skill cache manager, persistent Skill cache, or ResourceCache entry for Skill content. A changed fingerprint MUST be loaded for the next turn.

#### Scenario: Reopen a branch after Skill invocation
- **WHEN** a prior turn injected or read Skill content and its branch is reopened
- **THEN** Pi Session supplies the actual historical message/tool-result content and source/fingerprint receipt without resolving a stale locator or consulting a second cache

### Requirement: Legacy Skill control plane is absent
The successful Agent path MUST NOT use the legacy Skill loader/registry/service/injector, lifecycle store/projection/runtime, slot/conflict policy, ToolGuard, ToolSet activation, or model override.

#### Scenario: Poison legacy Skill lifecycle
- **WHEN** legacy Skill lifecycle entry points are configured to throw
- **THEN** trusted Pi Skill discovery and invocation still works and none of the poisoned entry points is invoked
