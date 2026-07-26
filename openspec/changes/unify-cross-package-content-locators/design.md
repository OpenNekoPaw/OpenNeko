## Context

The accepted workspace content architecture already treats ordinary files and
`neko/assets/<libraryName>/...` linked-library files as the same `workspace-file`
`ContentLocator`. `ContentReadService` reads bounded bytes from that closed locator union and
consumer-specific Host ports derive Webview, Engine, or processor projections.

Creator-visible handoff has not completed that migration. Generation requests and persisted Job
snapshots still mix `ResourceRef`, URL, URI, and base64; terminal Job results commit
`ResourceRef[]`; Agent Timeline/tool artifacts can contain paths and URLs; Workspace Board artifacts
accept `resourceRef` or `documentResourceRef`. `ResourceRef` belongs to the older Resource Cache
contract and permits source fields such as absolute `filePath`, URI, provider, scope, and library ID.
Consequently Canvas can receive a stable-looking generated resource without a portable location.

This is a local VS Code/TUI product. The design uses direct typed composition and capability-scoped
Host ports; it does not introduce a content registry, remote locator service, or generic resource
manager.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | Domain IDs own semantic identity; `ContentLocator` owns portable location/revision; Host ports own physical resolution and materialization; caller UI owns only presentation state.        |
| Dependency     | Agent, Generation, Canvas, and Board depend on shared locator contracts. Host adapters depend on filesystem/Webview/provider/Engine APIs. Shared contracts never depend on those runtimes. |
| Interface      | Durable DTOs carry `ContentLocator` directly. Data-plane execution types carry bytes/base64/opaque handles and cannot be encoded as Job, Timeline, Board, or project facts.                |
| Extension      | New durable source kinds extend the closed `ContentLocator` union with validation and a Host handler. New runtime consumers receive a narrow injected projection port.                     |
| Testing        | Contract validators, codec poison tests, producer/consumer path assertions, generated-output commit tests, and Extension Webview scenarios prove both result and canonical path.           |

## Goals / Non-Goals

**Goals:**

- Establish one durable creator-visible cross-package content location contract.
- Preserve semantic IDs and provenance without creating a second generic resource identity.
- Keep linked-library target paths and all runtime materializations inside Host boundaries.
- Make Generation Job inputs/results, Agent artifact projection, and Workspace Board delivery
  independently resolvable through `ContentReadService`.
- Fail visibly on legacy/runtime-only values and prove no fallback participates.

**Non-Goals:**

- Remove the Host-internal derived representation cache or all `ResourceRef` usage repository-wide.
- Change symlink creation, relink UX, workspace guard, or media-library enumeration.
- Replace Entity, artifact, Job, output, package, or document semantic IDs.
- Add a content registry, relocation daemon, automatic workflow, remote storage abstraction, or
  generic `ContentRef` wrapper.
- Change provider-specific wire formats; adapters still receive the bytes/base64/URL form required
  by their external API.

## Decisions

### 1. `ContentLocator` is the durable handoff contract

Durable creator-visible DTO fields use `contentLocator`, `inputLocators`, or `resultLocators` with
the existing closed `ContentLocator` union. They do not use raw `path + locator`, `ContentSourceRef`,
or `ResourceRef`.

`ContentSourceRef` remains migration input until its existing callers are migrated, but the paths
changed here reject it. A new `ContentRef = ContentLocator` alias is not introduced because it would
create two names for one authority and invite metadata/runtime handles back into a broad union.

Domain identity remains explicit:

```text
artifactId / entityId / jobId / outputId   semantic ownership and lineage
ContentLocator                             portable content location and version precondition
```

A generated-output locator already carries `outputId`, `revision`, `digest`, and normalized
workspace-relative `path`. Workspace and document locators use an optional fingerprint
precondition. Relocation or revision is performed by the owning domain and produces a new locator;
consumers do not mutate locator fields.

### 2. Linked libraries remain logical workspace sources

`neko/assets/<libraryName>/file` is persisted as a `workspace-file` locator. The OS link is the only
target mapping. The Host workspace guard may resolve the physical target while opening content, but
it returns only bounded bytes, safe metadata, or an opaque consumer projection.

No payload stores the link target, resolved absolute path, `${VAR}` path, library ID, fallback path,
or target availability cache. Broken links and realpath escapes return stable diagnostics.

### 3. Generation separates persisted requests from provider materialization

Generation domain requests use locators for reference image, mask, control image, IP-Adapter image,
start/end frame, video, and audio inputs. `GenerationJobSnapshot.request` is encoded only after
validating those locators.

Provider execution uses a distinct materialized request type. An injected Host materializer performs
bounded `ContentReadService.read()` calls immediately before execution and derives only the external
provider representation required by the selected adapter. The materialized request:

- may contain bytes, base64, multipart parts, or an authorized remote URL;
- exists only for the current attempt and observes cancellation/size limits;
- is never stored in Job snapshots, Timeline, Board, project files, or LocalMetadata;
- cannot be supplied by Agent/tool callers as a durable request.

Terminal commit writes generated bytes through the generated-output owner and atomically returns
`GeneratedOutputContentLocator[]`. A Job reaches `succeeded` only after all result locators validate
and match the committed output revision/digest.

### 4. Agent passes locators through the control plane

Agent Tool schemas and runtime catalog expose stable locator objects or opaque selection tokens that
the Host resolves to locators. The model is never asked to construct a locator from an absolute path,
Webview URI, provider URL, or cache record.

Agent attachment/perception/provider assembly resolves locators through
`AgentContentAccessRuntime`, reads bounded bytes in Extension Host, and creates provider-specific
input parts for the current turn. Tool results, Timeline media items, creator-visible artifact
snapshots, and detached Job observation retain the locator, not the materialized bytes or path.

### 5. Board and Canvas persist locators, then project at the final boundary

Non-Markdown Workspace Board artifacts contain exactly one `contentLocator` plus optional portable
display metadata such as MIME type and intrinsic dimensions. Canvas nodes persist the locator.
Canvas Extension resolves it through the injected content projection port when sending display state
to the Webview.

The Webview may receive an opaque panel-scoped `renderUri` together with the stable locator needed for
Host actions. It never receives `localPath`, link target, cache path, provider URL, or base64 as
durable node state. Open/reveal/save actions post the locator back to Extension Host.

### 6. Legacy contracts are poisoned at migrated boundaries

This is a prelaunch breaking change. Persisted Generation Job rows or pending Board delivery payloads
containing `resourceRef`, `documentResourceRef`, `localPath`, URI/base64 input fields, or unknown
locator kinds fail decoding with a stable migration-required diagnostic. Existing generated files
and project documents are not deleted or rewritten.

There is no dual-read, adapter, alias, inferred path, or ResourceRef-to-locator fallback in the
canonical request path. Explicit inspection/recovery tooling can report rejected records without
making them executable.

The generated-output projection decoder remains fail-visible by default. The Extension Host startup
composition may explicitly select a preserve-and-report rejection policy because these projection
rows are rebuildable indexes over durable generated files. Under that policy:

- each rejected row produces a stable diagnostic and is excluded from the in-memory
  `GeneratedAssetIndex`;
- the original LocalMetadata row and generated file remain unchanged;
- unrelated valid rows and newly generated outputs continue to load and persist;
- an ordinary index update cannot delete a rejected row;
- a new canonical projection with the same generated-output resource ID may replace the rejected
  row deliberately.

This is Host activation isolation for user-data protection, not legacy decoding or a compatibility
fallback. Agent, Canvas, and other embedded features must not become unavailable solely because one
rebuildable projection row requires migration. The product Host owns the generated-output index and
injects a read-only generated-asset catalog into embedded Agent consumers. An embedded feature must
not open a second LocalMetadata projection binding or independently reapply rejection policy.
The standalone Agent Extension Host may create and dispose its own binding because no product Host
catalog exists in that mode, but its startup composition must select the same preserve-and-report
policy, aggregate the rejected rows into a visible diagnostic, and continue activating with the
remaining canonical projections.

### 7. `ResourceRef` remains internal only where it models rebuildable representations

The Host derived representation/cache implementation may retain `ResourceRef` internally while that
subsystem exists. Product packages request semantic representations from
`ContentRepresentationService` and receive representation locators or bytes; they do not persist the
cache identity as creator-visible content.

Unrelated contracts still using `ResourceRef` are migration debt outside this change unless they
enter the Agent/Generation/Board creator-visible path. Architecture tests prevent the migrated paths
from importing cache contracts.

## Risks / Trade-offs

- **[Large producer/consumer compile surface]** → Migrate vertical paths in contract-first order and
  keep each path uncompilable until its producer and consumer agree; do not add compatibility unions.
- **[Provider adapters require different wire forms]** → Keep materialized request types explicit and
  adapter-facing; test that Job codecs reject every data-plane field.
- **[Mutable workspace files can change at the same path]** → Carry and enforce fingerprint
  preconditions when content identity matters; report `content-changed` instead of reading a newer
  file silently.
- **[Symlink target changes after relink]** → Workspace guard resolves the current direct-link target
  and fingerprint checks detect content changes; no historical target mapping is retained.
- **[Existing user-local Job/ledger/projection rows stop loading]** → Preserve underlying files and
  rejected metadata, report an actionable migration-required diagnostic, isolate rebuildable
  projection rejection from Extension activation, and allow users to resubmit/re-deliver through
  the new canonical path.
- **[ResourceRef remains elsewhere]** → Architecture tests ban it specifically from migrated public
  contracts; later domains require separate owner-aware changes rather than a mechanical rename.

## Migration Plan

1. Add/strengthen locator-only shared validators and compile-time poison fixtures.
2. Split Generation durable request/result contracts from provider materialized request contracts;
   migrate codec, coordinator, committer, routing, and provider adapters.
3. Migrate Agent Tool/Timeline/artifact projection and Extension content assembly to locators.
4. Migrate Workspace Board artifacts, planner, Canvas persistence, and Webview projection.
5. Delete replaced fields, resolvers, fallback branches, fixtures, and public cache imports from the
   migrated paths.
6. Run producer/consumer tests, affected builds/checks, Agent evaluation, and Extension Development
   Host scenarios for generated card/result/Board rendering.

Rollback is source rollback only. New prelaunch payloads are not dual-written in the old schema.

## Open Questions

None. `ContentLocator` is the existing accepted authority; this change completes its vertical
adoption for creator-visible Agent generation and Board delivery.
