## ADDED Requirements

### Requirement: Durable creator-visible content uses ContentLocator

Agent, Generation, Workspace Board, Canvas, and other creator-visible cross-package payloads covered by this change SHALL use validated `ContentLocator` values as their only content location contract.
They MUST NOT persist `ResourceRef`, `ContentSourceRef`, a parallel raw path, or a generic
`ContentRef` wrapper on the canonical path.

#### Scenario: Pass a linked-library file between packages

- **WHEN** a caller passes `neko/assets/<libraryName>/images/reference.png`
- **THEN** it passes one normalized `workspace-file` ContentLocator and no library ID, link target, absolute path, or fallback source

#### Scenario: Pass a generated output between packages

- **WHEN** Generation commits a creator-visible output
- **THEN** it returns one `generated-output` ContentLocator containing output identity, revision, digest, and normalized workspace-relative path

#### Scenario: Bind content to a semantic entity

- **WHEN** a domain associates content with an Entity, artifact, Job, or Board node
- **THEN** the domain identity remains a separate typed field and the content location remains a ContentLocator

### Requirement: Runtime materialization stays at the final Host boundary

Bytes, base64, multipart bodies, Webview URIs, Engine tokens, processor handles, physical paths, and provider URLs SHALL be derived only by capability-scoped Host ports for the current operation. They
MUST NOT become durable Job, Timeline, Board, project, or cross-package artifact facts.

#### Scenario: Send an image to an external provider

- **WHEN** a provider requires base64 or multipart image data
- **THEN** the Host reads bounded bytes from the input ContentLocator immediately before execution and keeps the materialized request out of the persisted Job snapshot

#### Scenario: Render an image in a Webview

- **WHEN** Agent or Canvas displays locator-backed content
- **THEN** the Extension projects a panel-scoped render URI and no local path, link target, cache path, or base64 is persisted or treated as content identity

#### Scenario: Send content to Engine

- **WHEN** a domain sends locator-backed media to Engine
- **THEN** the Host projection port returns an operation-scoped token or handle without exposing it as a durable locator

### Requirement: Generation Job snapshots contain portable requests and results

Generation Job requests SHALL represent all media inputs with ContentLocator values, and succeeded
snapshots SHALL contain only atomically committed result ContentLocators. Job codecs MUST reject
legacy URI/base64/path materializations and ResourceRef result fields.

#### Scenario: Persist an image-edit Job

- **WHEN** an image-edit request contains a source image, mask, or control image
- **THEN** the stored request contains validated input ContentLocators and no base64, URI, provider URL, cache path, or absolute path

#### Scenario: Commit terminal generated content

- **WHEN** the generated-output owner durably writes provider results
- **THEN** the Job transitions to succeeded only after valid result locators are atomically committed

#### Scenario: Decode a legacy Job row

- **WHEN** a persisted Job row contains materialized media inputs or `resultRefs`
- **THEN** decoding fails visibly with a migration-required diagnostic and does not execute or infer locators

#### Scenario: Activate with a rejected generated-output projection

- **WHEN** Extension Host startup encounters a generated-output projection row containing removed or invalid fields
- **THEN** the canonical decoder still rejects that row with a stable migration-required diagnostic
- **AND** the Host excludes the row from the in-memory generated-output index, reports it to the user, preserves the row and generated file unchanged, and continues activating unrelated Agent and Canvas features
- **AND** embedded Agent consumers reuse the Host-owned read-only generated-asset catalog instead of opening a second projection binding
- **AND** the standalone Agent Extension Host without an injected catalog explicitly applies the same preserve-and-report startup policy instead of propagating the row rejection as an activation failure
- **AND** later index updates do not delete the rejected row unless a newly encoded canonical projection deliberately replaces the same generated-output resource ID

### Requirement: Agent control-plane content remains locator-backed

Agent tools, Timeline items, detached Job observations, perception evidence, and creator-visible artifact snapshots SHALL retain stable ContentLocators. Agent provider assembly MAY read bytes only
through injected Host content access for the active turn.

#### Scenario: Use selected workspace media

- **WHEN** Agent uses a selected workspace or linked-library image in a tool/provider call
- **THEN** the selection resolves to a ContentLocator before execution and all persisted Agent projections retain that locator

#### Scenario: Observe a detached Generation Job

- **WHEN** Agent observes a terminal detached Generation Job
- **THEN** the terminal tool/card projection receives result locators without polling provider-private URLs or reconstructing local paths

#### Scenario: Receive an invalid runtime value

- **WHEN** an Agent path receives a Webview URI, blob URL, data URL, cache path, or absolute path as durable content
- **THEN** it fails visibly and does not fall back to ResourceRef or current active workspace state

### Requirement: Workspace Board and Canvas persist resolvable locators

Every non-Markdown Workspace Board artifact covered by this change SHALL contain exactly one
ContentLocator. Canvas SHALL persist that locator and obtain render projections from Extension Host
without storing runtime display values in the project document.

#### Scenario: Deliver generated media to Workspace Board

- **WHEN** Agent or direct generation delivers an image, audio, or video output
- **THEN** the Board artifact and resulting Canvas node retain the same generated-output locator and can resolve the committed file through ContentReadService

#### Scenario: Reopen a Board

- **WHEN** a workspace Board is saved, closed, and reopened
- **THEN** its locator-backed nodes are rendered through a fresh Host projection without relying on a previous Webview URI or local path

#### Scenario: Decode a legacy Board delivery

- **WHEN** a pending Board payload contains `resourceRef`, `documentResourceRef`, local path, or runtime URI instead of `contentLocator`
- **THEN** validation rejects the payload and does not infer a locator or silently omit the node

### Requirement: Locator validation protects workspace and link boundaries

Durable locators SHALL reject absolute paths, URI schemes, `${VAR}` paths, traversal, cache/temp
paths, malformed identities, and unknown kinds. Workspace linked-library reads SHALL additionally
enforce the managed direct-link and final-realpath containment rules without exposing physical
targets.

#### Scenario: Validate a portable workspace locator

- **WHEN** a normalized ordinary or `neko/assets/<libraryName>/...` workspace-relative path is supplied
- **THEN** locator validation accepts the logical path without resolving or persisting the link target

#### Scenario: Reject an external path

- **WHEN** a payload supplies an absolute path, file URI, traversal path, unmanaged symlink escape, or nested-link escape
- **THEN** validation or Host access fails with a safe diagnostic and no external path enters durable state

#### Scenario: Read through a managed direct link

- **WHEN** a valid linked-library locator is opened
- **THEN** Host follows the OS link, verifies final realpath containment within that direct target, and returns only bounded content or an opaque projection
