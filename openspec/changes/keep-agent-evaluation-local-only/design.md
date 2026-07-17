## Context

The repository currently has two GitHub-triggered Evaluation paths. The default test job reaches the key-free Evaluation harness through `check:test`, while a dedicated workflow performs provider-backed focused and scheduled matrices with repository secrets. Evaluation is development-time infrastructure that can consume credentials, quota and external model capacity; it is not required to establish ordinary build, unit-test or repository-quality correctness.

The local platform already exposes deterministic harness validation, focused case execution and repeated matrices. Those capabilities can remain available without any GitHub Actions owner.

## Goals / Non-Goals

**Goals:**

- Make every Agent Evaluation execution an explicit local developer action.
- Ensure GitHub Actions cannot invoke the key-free harness, provider-backed cases, repeated matrices, Evaluation credentials or report upload.
- Preserve ordinary unit, coverage, build, architecture and OpenSpec gates in GitHub CI.
- Preserve local harness validation and real provider-backed Evaluation commands.
- Add a deterministic CI-safe guard that proves the boundary without executing Evaluation.

**Non-Goals:**

- Remove the Evaluation platform, suites, fixtures, reports or local release-readiness responsibilities.
- Treat unit tests or key-free dry-runs as real Agent behavior evidence.
- Move provider credentials into another automation service or introduce a replacement scheduled runner.

## Decisions

### Delete the dedicated workflow instead of disabling its triggers

The `agent-evaluation.yml` workflow is removed completely. Leaving `workflow_dispatch`, a disabled schedule, an always-false job or a repository variable gate would preserve a GitHub-owned Evaluation path and could be reactivated without changing the execution boundary.

### Remove Evaluation from generic test composition

`check:test` runs coverage tests only. `test:agent:eval` remains an explicit command and is not reachable from `check:test`, `check:ci`, `ci:local`, or any GitHub workflow. This keeps the harness locally available without conflating it with ordinary unit tests.

### Rename the batch runner around local ownership

The former CI-oriented runner becomes `local-run.mjs`. Its canonical modes are `focused` and `matrix`; output uses a local-run summary identity. There is no compatibility alias because the project is prelaunch and retaining `ci-run.mjs` would preserve the wrong owner and invite GitHub reuse.

### Enforce the boundary from ordinary repository-quality tests

A test under `scripts/test-orchestration/` scans every GitHub workflow and recursively checks generic root CI script composition. It fails if those surfaces reference Agent Evaluation commands, paths, credentials, reports or runners. It also proves that the explicit local commands still exist. This test is safe for GitHub CI because it reads static files and never imports or executes the Evaluation platform.

### Keep reports local

Raw Evaluation reports remain gitignored and developer-managed. Documentation no longer promises trusted-CI retention or GitHub artifact upload. Existing suite report-policy fields are not changed in this focused boundary change because they describe a serializable retention ceiling and do not create an execution path; removing that schema is a separate data-contract migration if desired.

## Risks / Trade-offs

- [Provider regressions no longer run automatically on push or schedule] → Release and behavior changes must record an explicit local Evaluation command and evidence when the Evaluation Skill requires it.
- [Developers may forget the local step] → Keep change-to-suite authoring rules and release-review checklists explicit; do not compensate by adding hidden automation.
- [A future workflow could reintroduce Evaluation] → The ordinary test-orchestration guard scans all workflow files and generic CI script dependencies.
- [Historical documents mention old CI runs] → Preserve dated evidence as history, while updating normative developer and architecture documentation only.

## Migration Plan

1. Delete the dedicated GitHub Evaluation workflow and remove the harness from generic CI composition.
2. Rename the CI-oriented batch runner and update current developer documentation and tests.
3. Add the static local-only boundary guard to ordinary repository-quality tests.
4. Validate GitHub workflow absence, generic script reachability, local harness behavior and OpenSpec artifacts.

Rollback requires restoring the old workflow and CI composition as an explicit architecture change; there is no runtime data migration.

## Open Questions

None.
