## ADDED Requirements

### Requirement: NK and Asset sources use ordinary workspace paths
NKC, NKV, Asset facts, and new source projections SHALL persist linked media as `neko/assets/<libraryName>/<relativePath>`. They MUST NOT persist a media-library scheme, library ID, `${VAR}`, absolute target, file URI, cache path, Webview URI, or Engine token.

#### Scenario: Save linked media source
- **WHEN** an NK project or Asset references a readable linked file
- **THEN** its owner writes the workspace-relative path using the same grammar as another workspace file

#### Scenario: Reject retired source shape
- **WHEN** new authoring contains a media-library variable, absolute path, runtime URL, or cache path
- **THEN** validation fails before mutation with a field-level non-portable or migration-required diagnostic

### Requirement: Existing consumers use the shared Host source path
Engine registration, Preview, Agent, package/export, and processor input SHALL consume linked sources through the existing shared Host content path and MUST NOT implement target lookup.

#### Scenario: Consume one source in multiple domains
- **WHEN** Canvas, Cut, Agent, or Preview uses the same linked media path
- **THEN** each passes the identical workspace-relative source into the existing Host content boundary

### Requirement: Packaging dereferences linked bytes
Package and export workflows MUST read source bytes through the link and MUST NOT serialize the link object, target, retired settings, cache path, or Host absolute path.

#### Scenario: Package accessible linked media
- **WHEN** every referenced source passes the workspace-link guard
- **THEN** packaging writes source bytes and portable provenance into the owning package format

#### Scenario: Package unavailable or escaping media
- **WHEN** a link is broken or final realpath escapes its target
- **THEN** packaging fails visibly before claiming that source was included

### Requirement: Legacy media state requires explicit migration
Legacy variable/original-path/local-override settings and `${VAR}` or absolute project sources MUST be inspected read-only before entering the new writable model.

#### Scenario: Legacy source maps safely
- **WHEN** user-selected target and fingerprint prove the old source corresponds to `neko/assets/<libraryName>/...`
- **THEN** migration plans link creation, reference rewrites, fingerprint validation, and retired-setting deletion without changing project bytes before confirmation

#### Scenario: Legacy source cannot be proven
- **WHEN** variable is unknown, target is missing, name conflicts, fingerprint differs, or schema is unknown
- **THEN** the system preserves original bytes and returns actionable relink/migration diagnostics

### Requirement: Legacy mapping is not a runtime fallback
Normal source reads and new authoring MUST NOT resolve retired media-library variables or absolute paths through settings or compatibility branches.

#### Scenario: Normal read receives retired source
- **WHEN** a non-migration request contains retired media-library source syntax
- **THEN** it fails closed with migration-required and does not read through the old resolver

#### Scenario: Confirm migration
- **WHEN** the user accepts a validated migration plan
- **THEN** the Host creates or replaces the link, atomically saves workspace-relative references, removes retired mapping fields, and retains normal backup protection
