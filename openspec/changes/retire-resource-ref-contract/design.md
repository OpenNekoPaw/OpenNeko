## Context

`ContentLocator` is the accepted durable, creator-visible content-location contract. It has
owner-specific variants for workspace files, document entries, generated outputs, and package
resources, plus strict normalization and validation. `ResourceRef` predates that contract and still
combines six unrelated concerns:

1. a content or domain identifier;
2. a physical path, URI, or library/provider reference;
3. cache scope and provider selection;
4. source fingerprint and rebuild state;
5. a derived representation role;
6. a runtime projection usable by a Webview or external processor.

The previous `unify-cross-package-content-locators` change deliberately did not remove every
Host-internal use. The remaining type has since continued to leak through document, Agent, Canvas,
quality, processor, and plugin-transfer public surfaces. `DocumentImageInfo` demonstrates the
ambiguity directly by allowing `resourceRef`, `contentLocator`, and `representationLocator` for the
same output.

This is a prelaunch breaking change. Valuable workspace files and generated content must be
preserved, but rebuildable cache manifests and unsupported DTO snapshots need not retain a
dual-reader.

## Goals / Non-Goals

**Goals:**

- Make `ContentLocator` the only public, durable, cross-package content-location contract.
- Separate content location from semantic document positions, entity IDs, processor-output IDs,
  cache keys, physical paths, and Host projections.
- Remove the old types, public fields, constructors, guards, prompt/tool guidance, and fallback
  behavior in one canonical migration.
- Keep Agent attachments, Tool results, perception evidence, Timeline/artifact delivery, Canvas
  previews, and processor handoff locator-backed.
- Preserve explicit Host-authorized file reads and writes for Agent tools and shell execution
  without placing system paths inside durable locators.
- Reject old payloads visibly and prove the old path did not participate.

**Non-Goals:**

- Changing the `ContentLocator` variant definitions without a concrete uncovered owner.
- Replacing `DocumentSourceRef` or `DocumentLocator`; they respectively describe a document read
  session and a semantic location, not a general durable content identity.
- Defining the Desktop HTTP resource gateway, Webview URL shape, streaming protocol, media codec
  support, or cache eviction algorithm.
- Persisting `file:`, `data:`, HTTP, custom-scheme, blob, absolute-path, or provider URLs as content
  identity.
- Adding compatibility aliases, automatic path-to-locator inference, or dual-read/dual-write.

## Decisions

### 1. One canonical replacement matrix

Every old use is classified before implementation:

| Old responsibility | Canonical replacement |
| --- | --- |
| Workspace or linked-library source | `WorkspaceFileContentLocator` |
| Native document archive entry | `DocumentEntryContentLocator` |
| Generated media committed to the workspace | `GeneratedOutputContentLocator` |
| Built-in/package-owned content | `PackageResourceContentLocator` |
| Page raster, thumbnail, proxy, or other derived bytes | `ContentRepresentationLocator` |
| Page/chapter/slide/region meaning | `DocumentLocator` as a separate field |
| Entity, Job, artifact, output, or processor identity | owning domain ID as a separate field |
| Cache entry/variant identity | package-private cache key/source record |
| System path, URL, bytes, stream, process handle | operation-scoped Host materialization |

When a use does not fit the matrix, implementation stops and updates this design or the owning
locator union. It must not retain `ResourceRef` as an escape hatch.

Alternative considered: rename or narrow `ResourceRef`. Rejected because it would keep a second
public content identity and preserve the same ownership ambiguity.

### 2. Public contracts carry locators; runtime ports materialize capabilities

Renderer/Webview, Agent Timeline, Tool payloads, Board/Canvas documents, and cross-package domain
contracts carry a validated locator. Desktop Main or another owning Host service resolves it at the
last responsible moment into one of these operation-scoped capabilities:

- bounded content bytes or stream;
- authorized physical input/output path for Node, FFmpeg, or an approved shell tool;
- sender-bound HTTP/Webview URL;
- external-provider request body;
- engine or processor handle.

The materialized value is not written back into the locator or persisted projection. Agent bash
commands may operate on an explicitly authorized system path because a shell process requires one;
the command result and durable attachment/artifact still use a locator and the path grant expires
with the operation/session policy.

Alternative considered: encode all runtime forms as locator variants. Rejected because it would
make authority, lifetime, and machine-local state appear durable and portable.

### 3. Document images have one content identity and optional semantic location

`DocumentArchiveResourceRef` and its version-policy helpers are removed. A `DocumentImageInfo`
contains exactly one applicable content field:

- `contentLocator` for an addressable native archive entry; or
- `representationLocator` for a rendered page, thumbnail, proxy, or generated representation.

`locator?: DocumentLocator` remains independent to describe the semantic page/chapter/region.
Raw `path` can remain only where the document implementation returns an immediate Host-local
materialization inside its owning runtime; it cannot cross the Tool/Agent/Webview boundary as
identity. Cross-boundary codecs project the locator and reject legacy `resourceRef`.

Alternative considered: make `representationLocator` another `ContentLocator` variant now.
Rejected because the existing representation contract deliberately records derivation and
resolution through its owning service. This change removes ambiguity without broadening the base
locator union.

### 4. Cache identity becomes implementation-private

The resource cache may retain the concepts of scope, source fingerprint, variant role, lifecycle,
and rebuildability, but its manifest no longer stores a public `ResourceRef`. It stores a
cache-owned entry descriptor/key whose source is either a validated `ContentLocator`, an explicitly
runtime-only source descriptor, or another package-private identity justified by the cache owner.
No cache entry type is exported as a general content handoff DTO.

Existing prelaunch cache manifests using `ResourceRef` are invalidated and rebuilt. This is safe
because they are derived state. Source workspace files and committed generated outputs are not
deleted.

Alternative considered: retain `ResourceRef` only for cache internals. Rejected because the type is
exported from `@neko/types` and already leaks into public package contracts; a private cache model
makes the ownership enforceable.

### 5. Legacy values fail visibly at trust and persistence boundaries

Decoders and Tool/message validators explicitly reject `resourceRef`, `documentResourceRef`, and
the removed resource-ref object shape with a migration-required or invalid-contract diagnostic.
They do not infer a locator from `filePath`, URI, provider, cache key, current project, or active
selection. Compile-time removal covers direct TypeScript consumers; focused runtime rejection
tests cover persisted/wire-shaped `unknown` input.

Generation's existing explicit rejection of `resultRefs` remains until its legacy data policy is
retired separately; it is rejection behavior, not a live `ResourceRef` contract.

Alternative considered: accept old shapes and convert when a path looks workspace-relative.
Rejected because link ownership, digest/revision, package identity, and generated-output identity
cannot be reconstructed safely.

### 6. Migration follows vertical paths and removes the root last

Implementation proceeds contract-first:

1. Add failing contract/path tests and update target DTOs.
2. Migrate document/content production and consumption.
3. Migrate Agent Tool, attachment, perception, Timeline, projection, and processor paths.
4. Migrate Canvas/Webview, quality, 3D/composite, and plugin-transfer consumers.
5. Privatize resource-cache identity.
6. Delete root types, helpers, exports, prompt instructions, fixtures, and live fallback code.
7. Search production, tests, docs, and OpenSpec for remaining semantic references and retain only
   explicit legacy-rejection or historical text.

This avoids a compatibility layer while keeping each vertical path buildable during the change.

### 7. Agent evaluation updates the owning suite

The change updates the existing `agent-runtime.stream-delivery` owner unless suite discovery shows a
more specific mapped owner. Evidence must include one positive locator-backed attachment/Tool
result/artifact flow and one legacy payload rejection. Canonical evidence is a validated
`ContentLocator` retained through the public Agent path; forbidden evidence includes
`ResourceRef`, `DocumentArchiveResourceRef`, cache/system path persistence, Webview URI
persistence, and fallback conversion.

Key-free harness validation is necessary but is not real behavior acceptance. If the Desktop
complete-session driver, credentials, or provider access is unavailable, the focused real case is
recorded as `infrastructure-blocked`.

## Risks / Trade-offs

- [Large compile-time blast radius exposes unrelated old contracts] → Migrate vertical paths,
  keep diffs scoped, and use package typechecks before deleting the root export.
- [Dirty overlapping Agent/media work is overwritten] → Inspect each overlapping file immediately
  before editing and preserve unrelated hunks.
- [Document callers still depend on raw paths] → Distinguish runtime-local materialization from
  cross-boundary identity and add projector/codec tests at the first boundary.
- [Cache invalidation surprises users] → Delete/rebuild only derived manifests; never delete source
  or committed generated files, and emit an explicit invalid-schema diagnostic.
- [A hidden JSON payload still uses the old field] → Add repository searches plus strict unknown
  input rejection and poison tests.
- [Real Agent path cannot be executed locally] → Preserve deterministic contract evidence and
  report the exact complete-session infrastructure blocker without claiming behavior acceptance.

## Migration Plan

1. Land the new contract and rejection tests in owning packages.
2. Migrate all in-repository producers and consumers without a feature flag.
3. Invalidate rebuildable cache records containing the old schema; preserve all user content.
4. Delete the public old contract and run legacy/unused checks to prove no live path remains.
5. Update stable architecture and the HTTP gateway proposal after code uses one identity model.

Rollback is source-level only because this is a prelaunch contract cleanup. Reverting the complete
change restores the old contract; partial rollback or dual-read is not supported.

## Open Questions

None. A newly discovered content owner that cannot use the replacement matrix is a design-change
trigger, not an implementation fallback.
