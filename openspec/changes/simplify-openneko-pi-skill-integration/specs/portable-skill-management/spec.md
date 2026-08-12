## ADDED Requirements

### Requirement: Portable Skills use shared canonical roots
OpenNeko SHALL discover and create personal Skills only under `~/.agents/skills` and project Skills only under the exact Workspace `.agents/skills`. It MUST NOT create, scan or use `.neko/skills` as a normal Skill source.

#### Scenario: Assistant Conversation creates a Skill
- **WHEN** the generic CreateSkill capability succeeds in the configured Assistant runtime
- **THEN** it publishes the package beneath the exact personal `~/.agents/skills` root
- **AND** no `.neko/skills` directory is created

#### Scenario: Workspace Conversation creates a Skill
- **WHEN** the generic CreateSkill capability succeeds in an exact Workspace runtime
- **THEN** it publishes beneath that Workspace's `.agents/skills` root
- **AND** it does not use an active, recent or model-selected Workspace

### Requirement: OpenNeko data remains in its owning namespace
User-global OpenNeko configuration, structured state, Prompt, Command, cache and log authorities SHALL remain under `~/.neko`; portable Workspace project facts SHALL remain under `neko/`. The presence of these authorities MUST NOT make `.neko` a generic Portable Skill root, and normal runtime MUST NOT create or depend on Workspace `.neko/`.

#### Scenario: Skill layout is resolved
- **WHEN** the Desktop composes user-global OpenNeko storage and Portable Skill storage
- **THEN** it resolves them as independent `~/.neko` and `~/.agents/skills` authorities
- **AND** no generic layout helper maps Skills into `.neko`

### Requirement: Retired Skill locations remain untouched
Existing `~/.neko/skills` and retired Workspace `.neko/` bytes MUST remain outside normal product discovery, migration, repair and cleanup. OpenNeko MUST NOT report automatic migration success or silently copy those packages into a canonical root.

#### Scenario: Legacy personal Skill bytes exist
- **WHEN** startup encounters files under `~/.neko/skills`
- **THEN** normal Skill discovery ignores the path and leaves all bytes unchanged
- **AND** canonical personal Skills continue loading from `~/.agents/skills`

#### Scenario: User requests a future import
- **WHEN** a future explicit import feature is authorized for one selected legacy package
- **THEN** it validates and copies that package through the canonical personal installation path
- **AND** it does not delete or rewrite the selected source automatically

### Requirement: Management inventory is separate from executable identity
The management catalog SHALL own installed source, enablement, plugin provenance, removable state and diagnostics. The executable catalog SHALL contain only currently trusted, enabled and Pi-validated exact Skill identities. Management records and presentation labels MUST NOT execute a Skill.

#### Scenario: A personal Skill is disabled
- **WHEN** the user disables a valid installed personal Skill
- **THEN** it remains visible in management with disabled state
- **AND** it is absent from new executable turn snapshots

#### Scenario: A management card is stale
- **WHEN** Renderer submits an old management id or display name after the package changes
- **THEN** the mutation or invocation fails locally
- **AND** Main does not resolve it to a same-named executable Skill

### Requirement: Skill installation and creation are atomic and non-destructive
Personal directory installation and CreateSkill publication SHALL stage and validate one complete package through Pi before an atomic move into the canonical root. Path escape, symlink, size, duplicate, parse or write failure MUST preserve existing target and source bytes.

#### Scenario: A selected external package is valid
- **WHEN** the user explicitly selects a contained valid Skill directory and the target name is absent
- **THEN** OpenNeko atomically installs it under `~/.agents/skills/<name>`
- **AND** the next management and executable scans derive records from the installed package

#### Scenario: A target already exists
- **WHEN** installation or creation addresses an existing same-name target
- **THEN** the operation fails visibly without overwrite, merge or alternate destination
- **AND** the existing package remains byte-for-byte unchanged

#### Scenario: Staging validation fails
- **WHEN** Pi or package containment validation rejects the staged package
- **THEN** no target package is published
- **AND** temporary staging resources are released without modifying unrelated Skills

### Requirement: Skill removal is precise and recoverable
Only a safely resolved personal Skill management identity SHALL permit independent removal. Removal SHALL use the operating system trash when available; builtin and plugin Skills MUST NOT expose personal removal semantics.

#### Scenario: User removes a personal Skill
- **WHEN** Main re-resolves one current personal management id to a contained regular directory
- **THEN** it moves that exact directory to the system trash
- **AND** sibling packages remain unchanged

#### Scenario: User attempts to remove a plugin Skill
- **WHEN** a Skill is owned by a plugin package
- **THEN** individual Skill removal is unavailable
- **AND** its lifecycle remains owned by plugin installation/removal

### Requirement: Skill creation exposes a minimal stable result
CreateSkill SHALL return only the created Skill name, personal/project source and exact fingerprint to cross-runtime consumers. Absolute filesystem paths, internal root ids and empty diagnostic envelopes MUST NOT be projected to Agent or Renderer success results.

#### Scenario: Skill creation succeeds
- **WHEN** a package is atomically published and Pi validation returns one exact record
- **THEN** the caller receives its name, source and fingerprint
- **AND** the physical target path remains inside the owning Node service

### Requirement: Desktop management remains a thin Host adapter
Desktop Main SHALL provide only Electron-bound sender validation, native directory selection, trash and concrete filesystem/port wiring. Skill validation, source precedence, creation policy and executable projection SHALL remain in host-neutral Agent owning packages; Renderer SHALL own only localized presentation and typed user intent.

#### Scenario: User installs a Skill from the management surface
- **WHEN** Renderer sends an authenticated install request
- **THEN** Main obtains the native selection and delegates package policy to the Agent manager
- **AND** Desktop composition does not parse Skill content or decide a fallback target

#### Scenario: Management UI changes locale
- **WHEN** the user changes the Desktop locale
- **THEN** OpenNeko localizes management controls and first-party descriptions at presentation time
- **AND** canonical Skill content, fingerprint, source and executable identity remain unchanged
