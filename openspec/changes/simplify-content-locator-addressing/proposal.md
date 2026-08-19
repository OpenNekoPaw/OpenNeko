## Why

`ContentLocator` currently combines content addressing with freshness, Generation provenance, package ownership and representation-generation details. That overload leaks internal parameters into Agent Tool contracts and caused representation-only evidence to enter durable Board delivery without a valid durable content identity.

## What Changes

- **BREAKING** Define the canonical content address as one durable file reference plus an optional file-internal selector.
- Move fingerprint/change preconditions to content IO requests and results instead of locator identity.
- Keep Generation output identity/digest and package ownership/revision in their owning domain records, referenced alongside—not embedded as alternate address semantics inside—the content address.
- Delete `ContentRepresentationLocator` and replace it with a short-lived opaque `ContentRepresentationHandle`; it is not Agent-constructible or durable artifact identity.
- Expose only `path` for ordinary files and opaque `input_ref`, `unit_ref`, `cursor_ref` and `image_ref` values for complex content to the Agent.
- Require Board, Canvas durable nodes, transcript artifacts and creator-visible delivery to persist only canonical durable content addresses; explicit export/materialization creates a new durable address.

## Capabilities

### New Capabilities

- `content-addressing`: Canonical durable file/content selector address, opaque Agent references, representation lifetime and durable materialization boundary.

### Modified Capabilities

<!-- None. The active `unify-agent-workspace-board-delivery` change is corrected in place so it no longer defines representation locators as durable Board identity. -->

## Impact

- `@neko/content` owns the canonical address, file-internal selector, IO preconditions and internal representation service boundaries.
- `@neko/agent-runtime` owns opaque model reference binding and creator-visible artifact collection; raw locator/spec/generator fields do not enter model schemas.
- `@neko/canvas-domain` persists only durable canonical addresses in `.nkc` and Workspace Board projection.
- `@neko/generation`, Project and package owners retain their domain identity/provenance and map committed bytes to the canonical address without transferring ownership to Content.
- Preview and Desktop exact-resource adapters may resolve internal representation handles into short-lived URLs/bytes but never persist them.
- No UI change, compatibility shape, legacy locator reader, dual-write or automatic materialization is introduced.
