## 1. Contracts and package skeleton

- [x] 1.1 Add `@neko/quality` manifest with explicit core/model/project entries, strict TypeScript and Vitest config
- [x] 1.2 Add architecture tests for package dependency direction, public surface and retired Agent paths
- [x] 1.3 Add workspace, dependency-cruiser, Knip, strict package-check and test ownership integration

## 2. Move canonical Quality ownership

- [x] 2.1 Move Quality profile/evaluator/Gate runtime into Quality core
- [x] 2.2 Expose the multimodal provider-neutral evaluator through `@neko/quality/model`
- [x] 2.3 Move ProjectQuality facade orchestration into `@neko/quality/project`
- [x] 2.4 Move focused canonical Gate/project tests to the new package

## 3. Shrink Agent Extension

- [x] 3.1 Update canonical Tool and Capability provider to import Quality public entries
- [x] 3.2 Keep content-access and purpose-model adaptation in the Agent Host layer
- [x] 3.3 Delete deprecated MediaQuality/Consistency/Remediation/review runtime and old barrel without compatibility exports
- [x] 3.4 Update Agent boundary guards to poison retired paths
- [x] 3.5 Delete unused shared `types/quality/qa-types` DTO and legacy exports

## 4. Documentation

- [x] 4.1 Update package boundaries and Agent ADR from proposed Quality package to implemented owner
- [x] 4.2 Record deferred shared contract migration and domain-owned rubric/repair/apply boundary

## 5. Evaluation and verification

- [x] 5.1 Record `reuse` evaluation disposition, canonical path and forbidden fallback
- [x] 5.2 Run Quality and Agent Extension focused tests/typechecks/build
- [x] 5.3 Run dependency, unused, strict OpenSpec, test ownership, link and diff checks
- [x] 5.4 Run focused Agent evaluation or record provider-backed blocker without substituting mocks
