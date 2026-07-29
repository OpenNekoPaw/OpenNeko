## 1. Complete and freeze the inventory

- [ ] 1.1 Generate a machine-readable inventory for every `@neko/shared`
      package export, root-barrel symbol, wildcard/deep import and production
      consumer from the exact implementation revision.
- [ ] 1.2 Assign one runtime layer, canonical owner/entry, migration batch,
      durable-data impact and cycle disposition to every inventory item; reject
      unknown or multi-owner rows.
- [ ] 1.3 Add an inventory-drift gate that fails on unclassified new exports,
      symbols, deep imports or consumers.

## 2. Establish architecture and migration gates

- [ ] 2.1 Add L0/L1/L2 and Node/browser boundary fixtures for the current
      shared tree and every target owner.
- [ ] 2.2 Add checks that forbid new `@neko/shared` domain/UI/VS Code surfaces,
      package-to-App reverse imports, owner cycles and new wildcard consumers.
- [ ] 2.3 Define per-batch old-path poison tests and require producer/consumer
      path assertions before an export can be removed.
- [ ] 2.4 Record durable identity and migration fixtures for every persisted,
      wire, setting, secret, SQLite or project-file contract affected by a batch.

## 3. Remove unowned and L2/L1 surfaces

- [ ] 3.1 Delete exports with no production consumer and prove no legacy path
      succeeds.
- [ ] 3.2 Move React components, icons, React i18n and UI theme consumption to
      `@neko/ui`; migrate all Webview/Desktop consumers in the same batch.
- [ ] 3.3 Move VS Code adapters and VS Code test support to
      `apps/neko-vscode/src/adapters`, owning features or app test support; remove
      the shared VS Code entries.

## 4. Move domain contracts to their owners

- [ ] 4.1 Move Agent/Skill/Tool/Prompt contracts to Agent-owned L0 entries.
- [ ] 4.2 Move Canvas and NKC contracts to Canvas/Project owners selected by
      the inventory.
- [ ] 4.3 Move Media, Entity, Content, Chara and Quality contracts to their
      owning package entries.
- [ ] 4.4 For every batch, migrate all callers, remove the shared export and
      run cycle, typecheck, producer/consumer, path and unused gates.

## 5. Move stateful infrastructure without changing durable identity

- [ ] 5.1 Create `@neko/local-metadata` contract/node/sqlite/testing entries and
      move LocalMetadata ownership without changing database, namespace or
      workspace identity.
- [ ] 5.2 Create or select the canonical Project owner and move project-file
      IO, authoring and workspace project contracts without changing project data
      unless a versioned migration is accepted.
- [ ] 5.3 Add clean/existing/conflict/malformed/interrupted/retry fixtures for
      every required schema, key or path migration; preserve source data on every
      failure.

## 6. Close the shared kernel

- [ ] 6.1 Remove the `"./*"` package export and all undocumented deep imports.
- [ ] 6.2 Reduce the root barrel to audited core async/concurrency,
      logger/error/path, i18n core and approved host-neutral primitives.
- [ ] 6.3 Prove `@neko/shared` has no React, DOM, VS Code, Electron, Node
      implementation or product-domain dependency and does not re-export an
      owning package.
- [ ] 6.4 Run full build, test, check, legacy-debt, unused, package-cycle,
      Webview, Desktop/TUI and applicable runtime/evaluation gates; record any
      external blockers and residual risk.
