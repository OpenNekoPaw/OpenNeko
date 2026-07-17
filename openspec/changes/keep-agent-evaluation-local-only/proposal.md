## Why

Agent Evaluation can invoke configured providers, consume credentials and model quota, and retain runtime evidence. GitHub Actions currently triggers both the key-free harness and trusted provider-backed Evaluation, so repository events can start Evaluation without a developer making an explicit local execution decision.

## What Changes

- Remove the dedicated GitHub Actions workflow for focused, scheduled, and manually dispatched Agent Evaluation.
- Remove the Agent Evaluation harness from generic CI commands executed by GitHub Actions.
- Keep harness validation, focused cases, repeated matrices, and provider-backed Evaluation available only through explicit local developer commands.
- Add a deterministic repository guard that rejects any GitHub Actions workflow or generic CI script that references Agent Evaluation commands, credentials, reports, or runners.
- Update Evaluation and quality-gate documentation to describe local-only execution and local report retention.

## Capabilities

### New Capabilities

- `local-agent-evaluation-execution`: Defines the local-only execution boundary for Agent Evaluation and forbids GitHub-triggered Evaluation paths.

### Modified Capabilities

None.

## Impact

- GitHub Actions under `.github/workflows/`.
- Root test/CI script composition in `package.json`.
- Agent Evaluation workflow guards, runner naming, developer documentation, report policy, and quality-gate ADRs.
- Provider-backed behavior evidence remains a developer-invoked release or change-validation responsibility rather than a GitHub CI job.
