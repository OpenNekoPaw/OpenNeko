# Quality Inputs

This directory stores machine-readable quality gate inputs for repository scripts and CI jobs.

Human-readable architecture decisions, review policies, and validation matrices live in `docs/architecture/`. Files here are data ledgers consumed by repeatable checks, not long-form documentation or implementation logs.

## Contents

| Path                                        | Purpose                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ledgers/code-debt-surface-ledger.json`     | Repository-wide non-Agent legacy, fallback, and deprecated surface ledger.                       |
| `ledgers/neko-shared-public-surface.json`   | Canonical minimal Shared exports and permanently retired public entries.                         |
| `ledgers/package-boundary-exceptions.json`  | Exact, expiring baseline for current package identity, export, and source-alias migration debt.  |
| `ledgers/agent-code-debt-lcd-register.json` | Agent-specific legacy compatibility debt register for Agent boundary checks and review evidence. |
| `local-metadata-runtime-matrix.json`        | Supported SQLite Host, OS, architecture, and minimum runtime matrix.                             |
| `package-roles.json`                        | Complete workspace package role, runtime, product-status, and architecture-state catalog.        |
| `skill-development-history/history.json`    | Immutable, evidence-linked local Skill development checkpoints; excludes Market release state.   |

## Rules

- Keep ledgers deterministic and machine-readable.
- Adding a Shared responsibility needs architecture review and OpenSpec evidence that no owning domain or focused infrastructure package is appropriate.
- Update the consuming script and validation command when moving or renaming a ledger.
- Keep policy explanations in `docs/architecture/adr-code-review-quality-gates.md`; link to this directory for concrete CI input data.
- Do not store one-off command output, implementation journals, or dated status snapshots here.
