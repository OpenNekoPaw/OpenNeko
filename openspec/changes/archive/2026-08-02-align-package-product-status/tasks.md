## 1. Reachability Contract

- [x] 1.1 Define supported application production entries and exact value-import, re-export, dynamic,
      type-only, test/tooling, and migration-only edge rules.
- [x] 1.2 Implement graph fixtures and unit tests that prove runtime edges activate packages while
      non-runtime references do not.

## 2. Repository Gate And Role Corrections

- [x] 2.1 Implement a quality gate that compares computed production reachability with declared package
      product status and reports shortest owning paths.
- [x] 2.2 Add explicit, owner/reason/test/expiry-validated declarations for non-literal runtime registry
      edges without introducing generic allowlists.
- [x] 2.3 Mark the computed `@neko/chara`, `@neko/entity-node` and `@neko/search-domain` paths
      `active-product` while keeping operation exposure independent in the capability catalog; do not
      modify excluded Entity business schemas or behavior.
- [x] 2.4 Wire the gate into package-boundary/local quality/CI commands and document package versus
      capability status transitions.

## 3. Verification

- [x] 3.1 Record shortest-path evidence for Chara, Entity Node and Search plus a catalog-level test proving
      package activity alone does not expose an operation.
- [x] 3.2 Poison representative retained-kernel runtime imports and verify the new gate fails with the
      expected path; verify type-only/test-only fixtures stay accepted.
- [x] 3.3 Run package/capability boundary checks, `pnpm check`, `pnpm check:unused`, and affected builds
      and tests; record actual commands/results and residual dynamic-import risk.
