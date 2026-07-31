## 1. Build Consumer Evidence

- [ ] 1.1 Generate a machine-readable inventory of manifest, static import, dynamic loader,
      resource/catalog, root tooling, and test-only consumers for every workspace.
- [ ] 1.2 Audit Agent test-utils, Chara, Quality, Search, Skills, and the Tools contract/Webview island,
      including packaged-resource and persisted-format evidence.
- [ ] 1.3 Assign each zero-consumer package exactly one owner, disposition, evidence set, acceptance or
      review path, and package-specific target change where required.

## 2. Apply Approved Governance

- [ ] 2.1 Mark retained unintegrated kernels and resource/tooling owners accurately in package and
      product capability documentation.
- [ ] 2.2 Create separate implementation OpenSpecs for non-trivial Desktop integrations or domain
      ownership migrations.
- [ ] 2.3 Merge or delete only packages whose approved evidence proves no valuable data, dynamic
      consumer, external contract, or packaged resource depends on them.
- [ ] 2.4 Add a repository gate that rejects unlisted zero-consumer packages and stale disposition
      evidence without rejecting documented intentional kernels.

## 3. Validate Package Dispositions

- [ ] 3.1 Run inventory/gate tests, focused resource-loader and package tests, dependency/unused/legacy
      checks, `pnpm build`, `pnpm test`, and `pnpm check`.
- [ ] 3.2 Package Desktop and run runtime acceptance for each newly integrated or resource-loaded
      capability; prove unintegrated kernels are absent from delivery claims.
- [ ] 3.3 Record final dispositions, data impact, validation commands, and residual risk for the
      identity normalization prerequisite.
