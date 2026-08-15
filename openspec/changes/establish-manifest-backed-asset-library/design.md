## Context

OpenNeko has two different resource needs. Ordinary workspace and linked files need direct authorized
access through `ContentLocator`. Reusable Assets need explicit package membership, stable identity,
immutable user-visible revisions, dependencies, integrity, and a local lifecycle. The current flat
scanner conflates filesystem presence with membership and derives identity from paths.

This change is intentionally local. Network repositories, publishing, account credentials, cloud
synchronization, remote discovery and Entity Asset conversion are not current product requirements and
must not shape the local contract. They require a separate OpenSpec if introduced later.

## Goals / Non-Goals

**Goals:**

- Keep ordinary files catalog-free and directly usable.
- Define one canonical local Asset package and lifecycle.
- Make `(assetId, revision, digest)` the exact identity of installed immutable content.
- Verify and atomically install a complete dependency closure.
- Separate membership removal, uninstall, and garbage collection.
- Preserve owner identity and source-level diagnostics in Resources.
- Delete path-derived identity and legacy catalog success paths.

**Non-Goals:**

- Remote provider ports, publication, synchronization, accounts, credentials, CAS, tombstones,
  reconciliation, resumable network transfer, or public/private discovery.
- Cataloging or copying arbitrary workspace and Media Library files without explicit import.
- Entity Asset, Character portability, World portability, or mutable semantic facts.
- A generic package manager, filesystem synchronization engine, or multi-host service.

## Decisions

### 1. Asset Library manages explicit local packages

An Asset enters the library only through explicit import of selected content or installation of a
validated local package. Filesystem discovery never creates Asset identity or membership. A package
contains a closed manifest and owned package-relative members; it cannot persist absolute paths, cache
paths, Media Library targets, runtime URLs, or credential-bearing locations.

Media Library remains the direct file-resource entry. Import may copy selected bytes into staging, but
does not change or remove the source owner's file.

### 2. Installed immutable revision is the authority

`@neko/assets-domain` defines stable `assetId`, user-visible immutable `revision`, verified `digest`,
type metadata, dependencies, provenance, license, and package-relative members. Once installed, a
revision's manifest and bytes cannot change; edited content requires a new revision.

Verified manifests and bytes below the managed Asset root are authoritative. Mutable membership/head
and rebuildable search rows may live in local metadata, but neither can substitute missing or corrupt
package content. No network source or fallback resolver participates in open or lookup.

### 3. Local installation commits an exact dependency closure

`@neko/assets-node` stages selected local packages outside the installed namespace, parses the canonical
manifest, validates member containment, identity, size policy, dependency graph and digests, then commits
the complete closure atomically. Missing, cyclic, incompatible or digest-mismatched dependencies reject
the requested install without exposing a partial revision. Cancellation cleans uncommitted staging.

The package owner resolves exact dependency identity. It never substitutes latest revision, filename,
another local directory, or a stale projection.

### 4. Removal, uninstall and garbage collection are separate

The default remove action changes only mutable Asset Library membership. It does not trash the source,
uninstall a revision, delete blobs, or mutate project references. Explicit uninstall rejects a revision
pinned by another installed dependency or known project reference. Explicit garbage collection deletes
only bytes proven unreferenced by all installed revisions and pins.

Existing flat files and retired `library.json` data remain untouched and outside product discovery.
Only an explicit import can create or reactivate membership.

### 5. Resources preserves owners and isolates failures

Installed Assets is one presentation source alongside Project Files, Shared Media and Project Elements;
it is not a cross-domain catalog. Each item retains its owning identity and only owner-defined actions.
Search and selection are presentation state.

Source reads are independent. A failure while reading Project composition or Character associations is
reported on Project Elements and does not force Resources Root, Installed Assets, Project Files or Shared
Media into an unavailable state. Diagnostics remain visible and strict readers remain strict; no invalid
composition is accepted as empty or rewritten.

### 6. Package ownership and Desktop boundary

| Owner | Responsibility | Boundary |
| --- | --- | --- |
| `@neko/assets-domain` | manifest codecs, lifecycle rules, diagnostics, public ports | host-neutral |
| `@neko/assets-node` | staging, digest verification, atomic local install and storage | Node filesystem |
| `@neko/assets-webview` | Installed Assets projection and typed local intents | Renderer sandbox |
| `packages/local-metadata` | membership and rebuildable local search rows | local SQLite |
| `apps/neko-desktop` | sender-bound IPC, authorized paths, concrete Host adapters | Electron trust boundary |

Desktop does not parse manifests, choose lifecycle outcomes, or invent fallback sources. Renderer never
receives raw paths or performs package IO.

## Risks / Trade-offs

- A new Asset Library could resemble the retired catalog. Explicit import, closed manifests and absence
  tests prevent discovery-created identity.
- Atomic install may require duplicate staging space. Size checks occur before writes and cancellation
  removes uncommitted staging.
- Immutable revisions require a new revision for corrections. This is accepted for reproducibility and pins.
- Project reference coverage may initially be incomplete. Uninstall must fail visibly when blocker
  authority cannot prove safety; record removal remains non-destructive.

## Replacement Plan

1. Add strict local manifest/revision/dependency codecs and poison tests.
2. Implement verified staging, exact lookup and atomic local install.
3. Add membership, update-head, uninstall, blocker and garbage-collection services.
4. Switch Installed Assets and Desktop typed IPC to package-owned public ports.
5. Delete path-derived IDs, flat scanner authority, trash-based removal and legacy catalog reads.
6. Verify source-level failure isolation and real Electron local import/open/remove/uninstall flows.

Rollback never re-enables retired readers. Existing source files are untouched; committed immutable
packages remain readable by the canonical local owner.
