# Proposal: Keep content fingerprints internal to DSH authoring

## Why

`ContentFingerprint` is a real freshness and compare-and-swap primitive, but the current Canvas and Cut DSH Tools
expose its strategy/value to the model and require the model to echo it into mutations. This leaks an internal storage
precondition into the public Tool contract, increases argument-shape failures, and makes a freshness observation look
like resource identity. Cross-application source identity is `ContentLocator`; fingerprint computation and write
preconditions belong to the owning Content/authoring services.

## What Changes

- Remove fingerprint fields from model-visible Canvas and Cut Tool inputs and results.
- Keep `ContentFingerprint` in Content IO, Canvas/Cut authoring services, writers and internal projections where it has
  a concrete freshness or CAS consumer.
- For current additive Canvas `create-node` and bounded Cut `apply`, have the Host adapter read the exact current
  snapshot and pass its fingerprint internally into the existing atomic authoring operation.
- Reject retired model-supplied `expectedFingerprint` fields; do not add an alias, migration path or opaque token when
  the current operations have no need for a user-managed snapshot token.

## Impact

- **Owners:** Canvas/Cut own model-visible authoring contracts and internal CAS; Agent Runtime owns only ACP Host
  adaptation; Desktop composition is unchanged.
- **Affected packages:** `packages/canvas/domain`, `packages/canvas/dsh-plugin`, `packages/cut/domain`,
  `packages/cut/dsh-plugin`, `packages/agent/runtime`, and focused Desktop integration tests.
- **User data:** no durable Canvas, Cut, SQLite, Conversation or artifact data changes; no migration is required.

## Non-goals

- Do not remove `ContentFingerprint` from internal Content IO or writer contracts.
- Do not weaken lost-update protection or make fingerprint part of `ContentLocator`.
- Do not add model-visible hash algorithms, mtimes, provider fingerprints, versions or compatibility fields.
