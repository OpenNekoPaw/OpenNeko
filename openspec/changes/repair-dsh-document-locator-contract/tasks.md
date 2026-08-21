# Tasks

- [x] 1. Publish the canonical `ContentLocator` and operation-specific input schema from `@neko/content`.
- [x] 2. Add focused schema assertions and a managed media-library document read test.
- [x] 3. Run package tests, typecheck, OpenSpec validation, and record Agent Evaluation disposition and residual risk.
- [x] 4. Extend `ContentLocator.selector` for EPUB/CBZ entries, PDF pages, and DOCX text ranges while
      keeping one strict validator, identity key, and equality implementation.
- [x] 5. Convert non-ready content results into failed ACP/DSH Tool executions.
- [x] 6. Add malformed-range and failed-result regression coverage, then rerun focused build, quality gates, and key-free Agent Evaluation.
- [x] 7. Replace the nested model-visible document arguments with one flat operation-discriminated contract.
- [x] 8. Atomically update the official DSH plugin and poison nested/hybrid argument shapes in contract tests.
- [x] 9. Run package tests, Desktop build, boundary gates, strict OpenSpec, and key-free Agent Evaluation; record the real-provider blocker or result.
- [x] 10. Remove model-visible `DocumentLocator` / `DocumentRange`; decode targeted reads only from
      `source: ContentLocator` and reject the replaced parallel fields.
- [x] 11. Project manifest units, read results, cursors, Agent events, and Canvas artifacts with
      complete ContentLocators; add exact-locator and deduplication tests.
- [x] 12. Rerun focused Content/Agent/Desktop tests, typechecks, build, strict OpenSpec, boundary
      gates, and the selected key-free Agent Evaluation; record the real-provider blocker and the
      unrelated dirty-worktree internal-versioning baseline failure.
- [x] 13. Delete the `DocumentLocator` type, parser, aliases, and cross-package uses; migrate
      transferable addresses to complete ContentLocators and reader-only positions to transient
      `DocumentReadCoordinate` values.
- [x] 14. Add retired-name scan coverage and rerun Content, Search, Entity, Preview, Agent, Desktop,
      boundary, strict OpenSpec, build, and key-free Agent Evaluation validation.
- [x] 15. Accept explicit content mode with a selected ContentLocator, reject selected manifest
      reads, and add deterministic plus indexed Agent behavior coverage for the exact regression.
- [x] 16. Preserve manifest/content public semantics while keeping range/next private, and return
      the exact authorized decoder failure instead of generic unsupported-source.
- [x] 17. Add manifest dispatch and decoder failure tests, then rerun focused Content/Agent tests,
      typechecks, strict OpenSpec, Desktop build, and the selected key-free Agent Evaluation.
