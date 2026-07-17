# OpenNeko

> AIGC Content Creation IDE + Creative Agent + Media Engine, integrated into VS Code.

[中文](./README_CN.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.128+-blue)]()

OpenNeko is a monorepo for AI-native content creation workflows. It brings a creative Agent, canvas, video timeline, media preview, asset management, and media analysis tools into VS Code, with a TUI for Agent and model validation.

The architecture is contract-first:

- Webviews own UI and interaction only.
- Extension Host owns VS Code APIs, workspace integration, permissions, and lifecycle orchestration.
- The Rust Engine owns media codecs, GPU processing, file Range/seek, streaming, and export.
- Protobuf, shared types, and the Engine client keep cross-layer contracts explicit.
- Contract violations, unknown capabilities, and missing dependencies fail visibly instead of falling back to false success.

## Product Shape

| Layer          | Responsibility                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Creative IDE   | Canvas, Cut, Preview, Assets, and Tools                                                                        |
| Creative Agent | Intent understanding, Skill activation, capability discovery, planning, tool execution, rich media, and memory |
| Media Engine   | Rust-powered codecs, audio/video processing, GPU composition, timeline playback, streaming, proxy, and export  |

## Client Targets

OpenNeko currently splits product goals across two client targets:

| Product             | Canonical root     | Primary goal                                                                |
| ------------------- | ------------------ | --------------------------------------------------------------------------- |
| OpenNeko TUI        | `apps/neko-tui`    | Agent runtime, model quality, ablation, regression, and Evaluation evidence |
| OpenNeko for VSCode | `apps/neko-vscode` | Aggregates retained domain extensions for authoring, editing, and preview   |

Product composition lives in `apps/*`; shared contracts, the Agent runtime, domain implementations, Extension/Webview code, and the Engine client live in `packages/*`.

## Workspace Packages

| Group               | Packages                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- |
| Contracts and hosts | `neko-types`, `neko-proto`, `neko-client`, `neko-content`, `neko-host`, `neko-ui`       |
| Agent and grounding | `neko-agent`, `neko-entity`, `neko-search`, `neko-skills`                               |
| Creative surfaces   | `neko-canvas`, `neko-cut`, `neko-preview`, `neko-assets`, `neko-tools`, `neko-markdown` |
| Media engine        | `neko-engine`                                                                           |

## Current Focus

The active focus is making the pruned core workflow stable, verifiable, and releasable:

1. Converge PI Agent runtime, Skill, and capability routing on one execution path.
2. Keep the Rust Engine authoritative for codecs, GPU work, Range/seek, streaming, and export.
3. Connect Agent, Canvas, Cut, Preview, Assets, and Tools through stable contracts.
4. Preserve clear Webview, Extension Host, shared-contract, and Engine responsibilities.
5. Verify real paths through Agent Evaluation, package tests, and VS Code Webview functional tests.

## Quick Start

Requirements: Node.js 24+, pnpm 10, and VS Code 1.128+. Rust Engine work also requires a Rust toolchain and local FFmpeg dependencies.

```bash
pnpm install
pnpm build
pnpm test
pnpm check
```

For Rust Engine work:

```bash
cd packages/neko-engine
cargo test --workspace
```

## Repository Layout

| Path                         | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `apps/`                      | Current product build, test, package, and release roots |
| `packages/`                  | Workspace packages and VS Code extensions               |
| `openspec/changes/`          | Active OpenSpec changes                                 |
| `docs/architecture/`         | System constraints, ADRs, and architecture guidance     |
| `quality/`                   | Machine-readable quality gate inputs                    |
| `README.md` / `README_CN.md` | Project entry points                                    |
| `AGENTS.md`                  | Repository working rules                                |

## Documentation

| Need                                                | Start Here                                                   |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Project positioning, product shape, and quick start | [README.md](./README.md)                                     |
| Documentation navigation                            | [docs/README.md](./docs/README.md)                           |
| System architecture and ADRs                        | [docs/architecture/README.md](./docs/architecture/README.md) |
| Active design and implementation changes            | [openspec/changes/](./openspec/changes/)                     |
| Machine-readable quality gate inputs                | [quality/README.md](./quality/README.md)                     |
| Repository working rules                            | [AGENTS.md](./AGENTS.md)                                     |

Stable system constraints live in `docs/architecture/`, in-flight requirements, designs, specifications, and tasks live in `openspec/changes/`, and package-private implementation notes live in `packages/<pkg>/docs/`.

## Contributing

Before opening a change, keep the architecture boundaries clear:

1. Webview, Extension Host, Rust Engine, and shared contracts stay separated.
2. Cross-package work starts from contracts and small interfaces.
3. New state machines, public contracts, and failure paths need focused validation.
4. Documentation describes current decisions and invariants, not stale code samples or implementation logs.

## License

GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE).
