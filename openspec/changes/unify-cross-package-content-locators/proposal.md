## Why

Workspace-linked media libraries now expose ordinary workspace-relative paths through
`ContentLocator`, but creator-visible Agent, Generation Job, and Workspace Board payloads still use
the cache-oriented `ResourceRef` contract or persist runtime materializations such as URI/base64.
This leaves two competing content authorities, permits non-portable paths, and prevents consumers
such as Canvas from reliably resolving generated outputs.

## What Changes

- **BREAKING** Make `ContentLocator` the only durable cross-package locator for creator-visible
  workspace files, document entries, generated outputs, and package resources.
- **BREAKING** Replace Generation Job input and terminal `ResourceRef` fields with stable input and
  result `ContentLocator` values; provider bytes/base64/URL payloads become execution-only materialized
  requests and are not persisted in Job snapshots.
- **BREAKING** Replace Agent artifact, Timeline media result, and Workspace Board
  `resourceRef`/`documentResourceRef` handoff with `contentLocator`.
- Keep domain semantic identity separate from content location: Entity/artifact/job/output IDs remain
  domain-owned, while the locator carries portable source, revision, and fingerprint information.
- Derive bytes, base64, Webview URI, Engine token, or processor handle only in injected Host ports at
  the final consumer boundary.
- Reject absolute paths, `${VAR}` paths, cache/temp paths, runtime URIs/tokens, and unpromoted output
  locations in durable creator-visible payloads; linked-library target paths remain Host-private.
- Retain `ResourceRef` only for Host-internal rebuildable representation/cache paths and unrelated
  migration work; it is no longer accepted as a fallback by the migrated canonical paths.

## Capabilities

### New Capabilities

- `portable-content-locator-handoff`: Defines durable locator ownership, Host-only materialization,
  linked-library path safety, and canonical Agent/Generation/Board handoff behavior.

### Modified Capabilities

None.

## Impact

- Shared contracts and validators in `packages/neko-types`.
- Generation request, Job snapshot, result commit, codec, provider materialization, and tests in
  `packages/neko-generation` and Agent Platform media adapters.
- Agent Tool/Timeline/artifact collection and Extension Host content projection.
- Workspace Board delivery contracts, Canvas projector/codec consumers, and related tests.
- Active changes `introduce-domain-job-lifecycle-kernel` and
  `unify-agent-workspace-board-delivery` remain lifecycle/delivery owners and will reference this
  change for their resource handoff contract.
- Persisted prelaunch Job rows or pending Board deliveries using the replaced fields are rejected
  with explicit migration-required diagnostics; no dual-read or fallback is introduced.
