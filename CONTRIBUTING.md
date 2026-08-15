# Contributing to OpenNeko

Contributions grounded in real creative workflows are welcome, including reproducible issues, code,
Skills, model integrations, tests, and documentation improvements.

## Before You Start

[`AGENTS.md`](AGENTS.md) is the detailed authority for repository architecture, security, quality
gates, and completion criteria. Read these entry documents before making changes:

- [`README.md`](README.md) for product scope and current capabilities;
- [`docs/README.md`](docs/README.md) for documentation navigation;
- [`docs/architecture/application-composition.md`](docs/architecture/application-composition.md)
  for the Desktop-only composition boundary;
- [`docs/architecture/package-boundaries.md`](docs/architecture/package-boundaries.md) for package
  ownership and dependency direction;
- [`openspec/changes/`](openspec/changes/) for changes under design or implementation.

Non-trivial features, cross-package work, public contracts, and architecture changes require
OpenSpec artifacts before implementation. Small documentation and local corrections can proceed
directly but must still follow the current architecture.

Each OpenSpec proposal's `tasks.md` may contain at most 30 actionable checkbox tasks. Work beyond
that limit must be split into independently reviewable and verifiable proposals by objective,
owner, or delivery boundary; unrelated work must not be bundled into one task to evade the limit.

Changes to production modules under `apps/*`, `packages/*`, or `packages/*/*` must record the
owning responsibility, package role, canonical public path, producer/consumer, runtime boundary,
legacy-path removal conditions, user-data semantics, and validation commands. Internal packages
use the single `@neko/*` scope. Consumers must use explicit manifest exports instead of importing
`packages/**/src` or adding legacy scopes, path aliases, or compatibility re-exports.

## Local Development

Node.js 24+ and pnpm 10 are required.

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

Touch only files in the requested scope and preserve unrelated working-tree changes. Renderer and
Webview code must not access Electron or Node APIs directly; Host capabilities must be exposed
through minimal typed Desktop ports.

Agent Evaluation uses strict declarative suite, Scenario, assertion, and ablation artifacts. A Skill
may assist coverage decisions and draft authoring, but it must not generate per-case executable
scripts or own runtime protocols. Deterministic resolution remains in the existing runner unless a
new OpenSpec establishes a real standalone compiler boundary such as cross-process plans, multiple
execution backends, or stable plan caching.

## Validation

Select validation in proportion to the affected surface. Unit tests alone are not completion
evidence for a non-trivial change.

```bash
pnpm test
pnpm check
pnpm gate:local
pnpm package:desktop
```

Documentation-only changes require formatting, local-link checks, and `git diff --check`. For
Desktop visual, interaction, CSP, IPC, focus, or media changes, focused checks in the real Electron
application are recommended as advisory evidence.

Development work that adds or materially changes user-visible UI behavior should use
[`.codex/skills/neko-ui-validation/SKILL.md`](.codex/skills/neko-ui-validation/SKILL.md) to build the
affected-function inventory and perform separate functional, visual, and adjacent-regression
checks. Evidence should use the authoritative runtime for every affected boundary. Desktop trust,
preload, IPC, window or focus state, native resources, persistence, and lifecycle should use the real
Electron product path; browser or component previews are supplemental only. UI acceptance must not
pass while any required item is failed, blocked, missing, or unexecuted. Every required visual state
must have its current image evidence directly inspected by an image-capable Agent with the state,
observable findings, and uncertainty recorded. Screenshot existence, filenames, and scenario success
do not replace visual review. Record changes with no user-visible impact as `not-applicable` and state
the reason. UI validation is advisory and must not affect code-quality gates, task completion,
commits, merges, or releases. Graphical execution, visual judgment, and their contract tests must not
be added to `check:ci`, `gate:local`, `gate:remote`, `ci:*`, or GitHub Actions. Generic gates may keep
only a negative orchestration check proving that these local entrypoints remain unreachable.

Agent Evaluation harnesses, including `pnpm test:agent:eval`, real API runs, hidden or visible
Desktop sessions, repeated matrices, ablations, and graphical Electron acceptance are explicit
local-only developer operations. They must not be added to GitHub Actions or generic CI/gate
commands. Key-free and dry-run results prove platform readiness only, not real Agent behavior. Real
API Evaluation reads only `~/.neko/config.toml`; the path cannot be redirected, credentials remain
owned by product configuration, and provider/model selection plus cost authorization stay explicit.

Agent feature acceptance must drive actual controls in a visible Electron window and call a real
provider API. Batch regression runs without a visible UI but retains the complete Desktop session
owner, public Agent input path, and real API; it must not use a direct turn runner or mock. The
foundational matrix covers real conversation, context compaction, transcript restoration after a
complete reopen, restored generation records, conversation switching, and conversation isolation.
Delivery evidence must list covered, unexecuted, and blocked cells with residual risk.
See [`scripts/agent-eval/README.md`](scripts/agent-eval/README.md) for the local entrypoints.

## Change Description

A delivery note or Pull Request should include the change summary, key design, commands and results,
unexecuted checks, and remaining risk. Update the Chinese documentation when current capabilities,
architecture, contracts, or entry points change, and keep the English entry documents semantically
aligned.
