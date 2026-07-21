## 1. Gate Contracts

- [x] 1.1 Add stable local, branch, main, Proto, and Rust gate commands while preserving compatibility aliases
- [x] 1.2 Extend the Evaluation local-only guard across every generic gate root

## 2. CI Aggregation

- [x] 2.1 Implement a host-neutral required-job result aggregator with fail-visible diagnostics
- [x] 2.2 Add regression tests for success, optional skip, failure, cancellation, missing result, and required skip
- [x] 2.3 Add stable Branch Gate and Main Gate jobs to GitHub Actions

## 3. Documentation

- [x] 3.1 Document the three gate layers, authoritative signals, and specialized local-only exclusions

## 4. Verification

- [x] 4.1 Run focused orchestration tests and OpenSpec validation
- [x] 4.2 Run gate composition, legacy debt, unused-code, and diff hygiene checks
- [x] 4.3 Perform Neko quality review and record residual risks

## 5. Local And Remote Test Isolation

- [x] 5.1 Move the gitignored VS Code launch/tasks audit outside remote test discovery and expose an explicit local command
- [x] 5.2 Add local UI and real API command surfaces without making them generic gate dependencies
- [x] 5.3 Add orchestration guards proving remote workflows and gate roots cannot reach local runtime commands
- [x] 5.4 Update the quality ADR and verify focused orchestration, Canvas protocol, and full deterministic tests

## 6. External Gate Follow-up

- [x] 6.1 Configure GitHub main branch protection to require Pull Requests and the stable `Branch Gate`, including administrator enforcement and force-push/deletion protection
- [x] 6.2 Run focused orchestration, OpenSpec, diff hygiene, and external branch-protection verification
