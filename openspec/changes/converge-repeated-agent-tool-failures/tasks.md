## 1. Tool contract

- [x] 1.1 Require `ReadDocument.input_ref` in the flat provider-facing schema and add schema poison tests for missing/empty input.
- [x] 1.2 Validate continuation `input_ref` and `cursor_ref` against the same source before content execution.

## 2. Turn convergence

- [x] 2.1 Patch pinned Pi `Agent` wrapper forwarding for the existing low-level `shouldStopAfterTurn` hook and record its upstream removal condition.
- [x] 2.2 Add a turn-local identical-failure tracker that permits one correction and stops before a third provider request.
- [x] 2.3 Project/checkpoint convergence as a failed current turn and prove a later unrelated turn remains usable.

## 3. Evaluation and completion

- [x] 3.1 Reuse/update `agent-runtime.stream-delivery/read-document-tool-result` for required short-reference positive behavior and record deterministic ownership of forced repeat coverage.
- [x] 3.2 Run focused Agent runtime tests, typecheck, key-free Agent Evaluation and OpenSpec/Agent boundary checks.
- [x] 3.3 With explicit provider/model/cost authorization, run visible and hidden complete-Desktop ReadDocument cases; otherwise record them as `infrastructure-blocked`.
