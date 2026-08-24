# Evaluation

## Scope

- Change: Agent-created Generation Job lifecycle and output projection to the exact selected Canvas.
- Decision: update `agent-runtime.workflow-controller`.
- Canonical path: visible Agent composer -> DSH Generation Tool -> exact durable Job -> admitted Turn
  Canvas -> durable Job/result nodes.
- Forbidden fallback: direct provider operation, active/recent/default Canvas selection, transcript
  inference, terminal-only result mirroring or Canvas-owned Job state.

## Required cases

- Positive: one real media request shows a running Job node before settlement and the same node plus
  exact output references after success.
- Boundary: missing/wrong Canvas admission produces a local visible diagnostic while the durable Job
  remains owned by Generation and no sibling Canvas changes.
- Recovery: reopening the application restores the Job record and Canvas projection from durable
  authorities without raw runtime handles.
- Identity boundary: an Agent Job without optional `submissionId` remains pending/running and resumes
  by exact JobRef; no fabricated idempotency identity or `outcome-unknown` fallback participates.

## Evidence status

Deterministic evidence passed on 2026-08-22:

- Canvas Domain lifecycle, recovery, projection and contract suite: `38` files and `317` tests
  passed; this includes Agent Jobs with no `submissionId` remaining `running` by exact JobRef and
  exact one-node Workspace Board delivery receipts.
- Canvas Node runtime suite: `5` files and `27` tests passed; exact JobRef reattachment succeeds
  without fabricating or requiring submission metadata.
- Canvas Webview adjacent regression suite: `70` files and `444` tests passed with no component or
  styling changes.
- Agent Runtime focused Workspace Board delivery tests: `7` tests passed.
- Desktop exact-target delivery, domain Tool and Canvas runtime tests: `4` files and `50` tests
  passed.
- Canvas Domain, Canvas Node, Canvas Webview, Agent Runtime and Desktop TypeScript checks passed.
- Agent Evaluation authoring/harness: `45` files and `314` tests passed; the all-suite dry run loaded
  `26` suites and `71` cases.
- OpenSpec strict validation, package/application/Webview boundary checks and focused formatting
  checks passed. The separate Agent boundary composition failed before its production audit because
  its test fixture still reads the retired `packages/agent/contracts/src/tool-names.ts`; this change
  neither restores that retired path nor suppresses the visible failure.

The real visible Desktop/provider case is **blocked** in this worktree validation because it requires
an explicitly configured paid provider plus a disposable user-operable Workspace/Canvas fixture. It
was not replaced by a mock, direct runtime call or screenshot inference. Remaining acceptance is to
submit one image request through the visible composer, observe the pending/running Job node on the
turn-selected Canvas before settlement, then verify that the same node becomes completed and connects
to exactly one locator-backed result after success.

UI validation is applicable because the change adds visible Job/result states, even though no Webview
component changed. The authoritative boundary is the real Desktop runtime because exact Turn admission,
Workspace authorization, `.nkc` persistence and open-Canvas refresh cross Main/renderer lifecycle
boundaries. Functional and visual evidence for that path remains blocked with the provider case above;
existing package tests are adjacent regression evidence only.

Repository-wide `check:no-internal-versioning` is not clean in the shared worktree. Its reported new
and stale allowance paths belong to concurrent Agent contract, ContentLocator and other product work;
none is in this change's Canvas Generation identity files. This change does not suppress or
reinterpret that failure; it remains an external integration blocker for a full repository gate.
