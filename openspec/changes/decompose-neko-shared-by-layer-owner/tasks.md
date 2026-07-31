## 1. Freeze Shared Admission And Inventory

- [ ] 1.1 Generate a root/subpath/barrel export ledger with semantic owner, L0/L1/L2 layer, runtime
      dependencies, consumers, target entry, data impact, and disposition.
- [ ] 1.2 Apply the Shared admission rule to every row and reject file-size splits, generic replacement
      packages, and exports with a clearer domain/runtime owner.
- [ ] 1.3 Add dependency, browser-entry, and removed-export poison tests before moving consumers.

## 2. Migrate Ownership Families

- [ ] 2.1 Move domain-specific DTO and codec families to package-owned L0 contracts with all
      producers, consumers, and path assertions.
- [ ] 2.2 Move reusable React components/icons to `@neko/ui` and prove Webview/renderer dependency
      closures remain browser-safe.
- [ ] 2.3 Move Node, host, path, metadata, and project-I/O behavior to established L1 owners or
      justified Node entries with isolated persisted-data migration/rebuild/rejection tests.
- [x] 2.4a Retire the first 18 zero-production-consumer modules and their package-local tests, record
      their no-data-impact dispositions, and poison source/direct-entry reintroduction.
- [x] 2.4b Retire the second zero-production-consumer batch, remove the unused Agent reference
      contributor manifest field, and poison all removed source/direct/root exports.
- [ ] 2.4c Narrow all remaining `@neko/shared` exports to admitted L0 foundations and remove old
      barrels, aliases, fallbacks, and dual implementations.

## 3. Validate Converged Shared Boundary

- [ ] 3.1 Update package/architecture documentation and guards; leave directory renaming to
      `normalize-package-directory-and-npm-identities`.
- [ ] 3.2 Run all affected producer/consumer tests, `pnpm build`, `pnpm test`, `pnpm check`,
      dependency/unused/legacy gates, and protected project/metadata fixture tests.
- [ ] 3.3 Package Desktop and run affected real Electron data/UI paths; record validation and residual
      risk.
