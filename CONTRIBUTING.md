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

## Validation

Select validation in proportion to the affected surface. Unit tests alone are not completion
evidence for a non-trivial change.

```bash
pnpm test
pnpm check
pnpm gate:local
pnpm package:desktop
```

Documentation-only changes require formatting, local-link checks, and `git diff --check`. Desktop
visual, interaction, CSP, IPC, focus, or media changes also require focused acceptance in the real
Electron application.

## Change Description

A delivery note or Pull Request should include the change summary, key design, commands and results,
unexecuted checks, and remaining risk. Update the Chinese documentation when current capabilities,
architecture, contracts, or entry points change, and keep the English entry documents semantically
aligned.
