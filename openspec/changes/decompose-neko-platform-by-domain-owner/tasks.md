## 1. Freeze Platform Ownership

- [ ] 1.1 Generate an export-level inventory of `@neko/platform` with runtime layer, static/dynamic
      consumers, storage effects, target owner, public entry, and disposition.
- [ ] 1.2 Resolve every inventory row to Agent, AI SDK, Generation, Desktop Main, another established
      owner, or removal; reject ownerless and replacement-facade targets.
- [ ] 1.3 Add failing architecture/path tests for Platform imports, exports, aliases, and fallback
      execution before migrating consumers.

## 2. Migrate Domain And Host Paths

- [ ] 2.1 Move Agent model/purpose/provider contracts and AI SDK adaptation with producer/consumer
      tests and direct public-entry imports.
- [ ] 2.2 Move Generation job, output, commit, reconciliation, and justified Node execution paths to
      `@neko/generation`.
- [ ] 2.3 Move concrete user configuration, credential, filesystem, and OS integration to Desktop
      Main adapters with explicit storage migration/rejection tests.
- [ ] 2.4 Migrate Desktop and package consumers vertically, proving each canonical owner is invoked
      and the Platform path is poisoned.

## 3. Retire Platform And Validate

- [ ] 3.1 Delete `packages/neko-platform`, its manifest/lockfile/orchestration references, stale tests,
      and active documentation without a facade or compatibility alias.
- [ ] 3.2 Run focused producer/consumer and storage tests, `pnpm build`, `pnpm test`, `pnpm check`,
      dependency/unused/legacy gates, and affected Agent evaluation.
- [ ] 3.3 Package Desktop and run focused real Electron configuration/provider/generation acceptance;
      record commands, results, protected-data behavior, and residual risk.
