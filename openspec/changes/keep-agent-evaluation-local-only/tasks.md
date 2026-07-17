## 1. Remove GitHub execution paths

- [x] 1.1 Delete the dedicated Agent Evaluation GitHub Actions workflow.
- [x] 1.2 Remove the Evaluation harness from generic root test and CI script composition while preserving the explicit local command.

## 2. Establish local-only Evaluation ownership

- [x] 2.1 Rename the CI-oriented Evaluation batch runner and tests to the local runner contract, including focused and repeated matrix modes.
- [x] 2.2 Add a deterministic test-orchestration guard for all GitHub workflows and generic CI script reachability.
- [x] 2.3 Update current Evaluation and quality-gate documentation to describe explicit local execution and local report retention.

## 3. Verify the boundary

- [x] 3.1 Run the static boundary guard, focused runner tests, and key-free Evaluation harness locally.
- [x] 3.2 Run formatting, strict OpenSpec validation, and diff checks; record any unrelated baseline failures or remaining risk.
