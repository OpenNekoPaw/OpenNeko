## 1. Freeze Rename Preconditions

- [ ] 1.1 Confirm Platform removal, Shared convergence, Host refinement, and zero-consumer
      dispositions are complete and accepted.
- [ ] 1.2 Regenerate the authoritative app/package mapping and reconcile every current workspace,
      consumer, removed/merged row, final directory, and final identity.
- [ ] 1.3 Validate each target path and remove only ignored reproducible artifacts; add failing
      stale-name, duplicate-identity, and aggregate-root poison tests.

## 2. Apply Canonical Identities

- [ ] 2.1 Rename Agent runtime to `packages/neko-agent` while retaining exactly one `@neko/agent`
      runtime owner and no aggregate package semantics.
- [ ] 2.2 Rename retained mixed-scope, ambiguous, unscoped, and directory-mismatched packages exactly
      as specified by the approved mapping.
- [ ] 2.3 Update manifests, public exports, all imports, TypeScript references, root scripts, Turbo,
      test orchestration, CI/release tooling, quality ledgers/guards, and active documentation.
- [ ] 2.4 Regenerate the pnpm lockfile and prove no old identity resolves through an alias, path
      mapping, fallback import, re-export package, or dual registration.

## 3. Validate Repository Transition

- [ ] 3.1 Run package-resolution/topology tests, focused producer/consumer tests, `pnpm build`,
      `pnpm test`, `pnpm check`, and dependency/unused/legacy gates.
- [ ] 3.2 Run `pnpm ci:local`, package Desktop, and execute a focused real Electron project-open and
      creative-surface path against isolated fixtures.
- [ ] 3.3 Record the final mapping, protected-data result, exact commands, platform coverage, and
      residual risk.
