# W7 Visible Desktop Manual Foundational Acceptance

Date: 2026-08-22

> 2026-08-25 suite identity update: `perception-routing` below is the historical name used for this run. The canonical owner is now `media-tool-routing`; no alias is retained.

## Evaluation Scope

- Change/feature: DSH foundational product behavior after the atomic runtime cutover.
- Decision and owning suites: `update` the existing workflow-controller, launch-binding,
  perception-routing and domain Tool coverage. This artifact records supplemental human acceptance;
  it does not replace their script-driven hidden/visible Desktop runs.
- Required runtime: the actual OpenNeko product surfaces operated by the user. No direct runtime
  runner, mock response or key-free dry-run is counted as this manual result.
- Forbidden fallback: Pi, active/recent Conversation or Workspace inference, text-only image
  substitution, and a second Host transcript, queue, compaction or Tool execution path.

## User-Confirmed Manual Cases

The user confirmed the following behaviors through the product UI:

- Workspace navigation/context and ordinary assistant conversation complete normally.
- Application restart restores the conversation and transcript.
- Multiple conversations switch correctly and keep their state isolated.
- Context compaction completes and the same conversation continues afterward.
- Background tasks continue and their state remains available independently from the visible scene.
- Document and Canvas Tools execute successfully from the assistant path.
- Image input, processing and conversation replay work through the product surface, including after
  restart.

The existing deterministic tests remain the evidence for strict identity, authorization,
no-fallback, malformed-input and sibling-isolation boundaries. This manual record supplies the
previously missing positive product-path acceptance for tasks 7.10, 7.14 and 8.3.

## Evidence Classification

- Evidence level: user-confirmed visible Desktop manual acceptance.
- Provider/model identity: not separately captured in this supplemental record; the earlier
  provider baseline remains `nekoapi-chat / gpt-5.6-luna`, but this record does not infer that the
  same selection was used for every manual case.
- Machine-readable run/report, screenshots, token usage and cost: not captured by this manual
  record.
- Key-free readiness remains independently proven by 45 files / 314 tests and 26 suites / 69 cases
  in the 2026-08-22 all-suite dry-run.

## Residual Risk

This evidence does not complete tasks 10.4, 10.5 or 10.7. Release qualification still requires the
script-driven complete Desktop owner, exact provider/model and canonical-path receipts, protected
hidden/visible coverage, approval and remaining Skill/MCP/domain Tool cells. The foundational matrix
proposal also remains open until its indexed real-provider cases and reports are produced; manual
success must not be relabeled as hidden batch or machine-verifiable no-fallback evidence.
