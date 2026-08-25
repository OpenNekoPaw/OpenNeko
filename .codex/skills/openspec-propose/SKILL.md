---
name: openspec-propose
description: Create an OpenSpec proposal for an unlanded system-level or product-level capability change that alters a capability boundary, core product workflow, persistent user facts, or a security/trust boundary. Do not use for local UI details, bugs, performance work, refactors, cleanup, internal contracts, tests, tooling, comments, audits, status work, or a capability whose canonical implementation already exists.
license: MIT
---

# OpenSpec Propose

Create the minimum product-level artifacts required to make one qualifying change ready for implementation.

## Scope gate

Before running an OpenSpec command or writing an artifact:

1. Read the applicable repository instructions and `openspec/config.yaml`.
2. Confirm the request can be named as an independent system or product capability and changes at least one of these boundaries:
   - system capability;
   - core product behavior or workflow;
   - persistent user facts or lifecycle;
   - security or trust.
3. Treat code size, file count, module count, user visibility, or the word "feature" as insufficient on their own.
4. Reject proposal creation for local UI or interaction details, bug fixes, performance work, behavior-equivalent refactors or cleanup, package/internal contracts, tests or quality gates, build/dependency/tooling changes, comments, inventory, audits, status updates, or implementation records.
5. Reject proposal creation when production code already provides the canonical capability path and only local repair, cleanup, or verification remains.

If the gate fails, stop before `openspec new change`. State briefly that repository policy requires direct code and test work. Do not create a placeholder, research, status, or verification change. A higher-priority explicit user instruction may override repository defaults, but disclose the scope mismatch before writing artifacts.

## Workflow

1. Inspect current code, tests, active changes, and stable architecture/domain documentation. Current code and tests are authoritative for implementation state.
2. Derive or confirm one kebab-case change name. If an exact change already exists, ask whether to continue it; do not create a duplicate.
3. Run `openspec new change "<name>"`, then inspect `openspec status --change "<name>" --json`.
4. For each artifact required by `applyRequires`, run `openspec instructions <artifact-id> --change "<name>" --json`, read its completed dependencies, and fill the returned template.
5. Keep proposal, design, specs, and tasks at product intent, system boundary, product milestone, and final acceptance level. Do not record code files, classes, functions, commands, dates, verification logs, or step-by-step implementation progress.
6. Re-run status until the change is apply-ready, then run the repository OpenSpec validation.

Report the change name, artifact paths, validation result, and whether implementation is ready.
