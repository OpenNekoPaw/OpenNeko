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

### Requirement: Legacy media state is rejected before mutation
Legacy variable/original-path/local-override settings and `${VAR}` or absolute project sources MUST fail closed before entering the new writable model. The product MUST NOT expose an implementation-only inspector, classifier, archive, migration planner, or execution contract without a reachable Host command and confirmation owner.

#### Scenario: Legacy source is presented to the current product
- **WHEN** a reader or writer receives retired media settings or source syntax
- **THEN** it preserves original project bytes and returns an actionable diagnostic directing the user to create/relink the library and re-import or re-author the reference through the canonical workspace path

#### Scenario: Legacy source cannot be proven
- **WHEN** variable is unknown, target is missing, name conflicts, fingerprint differs, or schema is unknown
- **THEN** the system preserves original bytes and returns actionable relink/re-import diagnostics without guessing or constructing a hidden migration plan

### Requirement: Legacy mapping is not a runtime fallback
Normal source reads and new authoring MUST NOT resolve retired media-library variables or absolute paths through settings or compatibility branches.

#### Scenario: Normal read receives retired source
- **WHEN** a non-migration request contains retired media-library source syntax
- **THEN** it fails closed with migration-required and does not read through the old resolver

#### Scenario: Re-author a rejected legacy reference
- **WHEN** the user creates or relinks the intended library and re-imports or reselects the source through a current product entry
- **THEN** the canonical writer stores only the workspace-relative reference in a new revision while the rejected legacy bytes remain untouched until the user intentionally replaces them
