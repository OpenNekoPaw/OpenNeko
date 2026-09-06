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
- [`openspec/changes/`](openspec/changes/) for product-functional changes under design or implementation.

OpenSpec is reserved for independently named system-level or product-level capabilities that change
a system boundary, core product workflow, durable user fact, or security/trust boundary. Create it
before implementation and keep only product intent, system boundaries, and product-level acceptance.

Do not create or expand an OpenSpec for local UI/interaction details, bug fixes, performance work,
behavior-preserving refactors or cleanup, package/directory/internal-contract changes, tests/quality
gates, build/dependency/developer tooling, or inventory/audit/status work. Change code and tests
directly and keep necessary evidence in the commit, PR, delivery note, or gitignored report rather
than a status, research, or verification document.

Delete a proposal once code owns the canonical path and only local fixes or supplemental validation
remain. Promote only system architecture or core product-design conclusions. Do not retain archives,
implementation evidence, verification/evaluation reports, or historical task copies.

OpenSpec tasks contain only a few product-level milestones and final acceptance outcomes. They must
not track files, classes/functions, per-commit steps, command output, dated evidence, or code progress.
Code and tests are the source of truth for business logic, implementation, and implementation status.

Long-lived documentation describes only the current canonical architecture, development policy, and
core product design. Do not retain narratives about removed packages, paths, protocols, or proposals,
migration phases, completion status, Accepted/Deprecated labels, or update dates. File names must match
their current responsibility. Code, tests, and machine-readable ledgers own the current package catalog,
product reachability, and implementation status.

Changes to production modules under `apps/*`, `packages/*`, or `packages/*/*` must record the
owning responsibility, package role, canonical public path, producer/consumer, runtime boundary,
legacy-path removal conditions, user-data semantics, and validation commands in delivery review.
OpenSpec keeps only stable product boundaries and product-level milestones; it does not duplicate
implementation evidence from delivery review. Internal packages use the single `@neko/*` scope. Consumers must use explicit manifest
exports instead of importing `packages/**/src` or adding legacy scopes, path aliases, or
compatibility re-exports.

A singleton owner uses `packages/<name>`. Once it gains an independently built role package, the
same change must convert it to a pure `packages/<family>/<role>` family whose container has no
`package.json`. Do not add flat `packages/<family>-<role>` packages, mix a family-root package with
nested roles, distribute one family across physical roots, or cite an existing unmigrated path as
precedent. A package move or deletion must also remove rebuildable build, cache and package-local
dependency artifacts from the exact retired root and prove that root is gone; never use a broad glob
that can touch user data or unrelated packages.

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

UI acceptance primarily uses manual interaction with the real application. Automated tests should
verify actual behavior, state changes, error propagation, and resource lifecycles. Document wording,
CSS values, selector presence, or screenshot names do not prove that a feature works. Do not weaken
product error handling, add test-only success paths, or hide failures to make tests pass.

Select validation in proportion to the affected surface. Unit tests alone are not completion
evidence for a non-trivial change.

```bash
pnpm test
pnpm check
pnpm gate:local
pnpm package:desktop
```

Documentation-only changes require formatting, local-link checks, and `git diff --check`. Desktop
visual, interaction, CSP, IPC, focus, or media changes must exercise the affected functional path in
the real Electron application; browser and component previews supplement browser-only evidence.
Visual review remains recommended advisory evidence.

For new or materially changed UI behavior, manually check affected functions, visual states, and
adjacent functions in the real Electron application. Desktop trust, preload, IPC, window/focus,
native resources, persistence, and lifecycle require the actual product path; browser or component
previews only supplement this evidence. Screenshot existence, filenames, DOM data, or a successful
script do not replace interaction and visual review. Record failed, blocked, missing, or unexecuted
items explicitly; do not report them as passed. Explain when a change has no user-visible impact.
Visual judgment is advisory and does not replace functional, contract, security, or code gates.
Graphical execution must stay outside generic CI/gates.

Deterministic Agent validation belongs to owning-package tests and DSH qualification. Developers
validate real behavior manually in the fully assembled Electron application; real API acceptance
stays out of GitHub Actions and generic CI/gates. Deterministic tests cannot prove real Agent
behavior. Real API runs read only `~/.neko/config.toml`, with credentials resolved by the product
configuration owner. Provider/model identities and authorization for the run's API cost must be
explicit.

Agent feature acceptance must drive actual controls in a visible Electron window and call a real
provider API; a direct turn runner or mock cannot substitute for feature acceptance. The
foundational matrix covers real conversation, context compaction, transcript restoration after a
complete reopen, restored generation records, conversation switching, and conversation isolation.
Delivery evidence must list covered, unexecuted, and blocked cells with residual risk.

## Change Description

A delivery note or Pull Request should include the change summary, key design, commands and results,
unexecuted checks, and remaining risk. Update the Chinese documentation when current capabilities,
architecture, contracts, or entry points change, and keep the English entry documents semantically
aligned.
