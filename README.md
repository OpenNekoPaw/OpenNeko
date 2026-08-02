# OpenNeko

> A local-first, Agent-driven, open-source content creation workspace.

[中文](./README_CN.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)](./LICENSE)

OpenNeko is for creators who want control over their project files, model connections, and creative workflow. Instead of being another online model aggregation platform, it lets an Agent understand a local project, invoke creative capabilities, and move generated results into a canvas, Media Library, timeline, and preview tools for continued work.

## Key Ideas

- **Local projects first**: assets, characters, project context, and creative outputs are organized around the local workspace.
- **Bring your own AI services**: configure external APIs, compatible APIs, or local API services without being tied to one model platform.
- **Agent-driven creation**: the Agent can understand the current project, plan tasks, invoke tools, and help generate, analyze, and iterate content.
- **A continuous workflow**: generated content can move into the canvas, Media Library, and video timeline for editing, preview, and export.

## Current Desktop Capabilities

| Integrated surface | Current boundary                                                                    |
| ------------------ | ----------------------------------------------------------------------------------- |
| Creative Agent     | Desktop project conversations, context, tool use, and controlled content generation |
| Canvas             | Organize Markdown, media, files, groups, generation Jobs, and Canvas references     |
| Video Timeline     | Lightweight audio/video arrangement, preview, and Node/FFmpeg export                |
| Media and Entity   | Browse workspace/global libraries, recover project links, and project Entity media  |
| Read-only Preview  | Preview common documents, images, audio/video, and supported standard 3D models     |

Available generation and understanding features depend on your configured APIs, model access, and local services.

Project files keep portable media references rather than machine-local Media Library targets. After
syncing or cloning to another machine, Desktop shows the missing project libraries and requires
explicit link recovery; ordinary sync does not copy external media bytes. For a complete handoff,
users can create an independent portable snapshot containing only media actually referenced by the
project. The global Library Browser and project Resource Browser keep independent UI state.

The repository also retains Chara, Search, Quality, and media-comparison Tools packages, but they do
not all have Desktop product paths yet. Character projects, Interactive World, professional-tool
integrations, and a standalone asset-comparison surface remain unavailable or planned; package
existence alone does not make them product capabilities.

## Project Status

OpenNeko is currently in **Alpha** and is primarily intended for source-based previews and product validation. Real Desktop composition paths exist for the foundation, Agent, Media Library, Canvas, Cut, and Preview, but the complete Phase 1 creative workflow is not finished and this is not yet a supported release product. Installation, upgrades, compatibility, interfaces, and project formats may still change. Electron Desktop is the only product host; Agent, model, Skill, and workflow validation follows the Desktop composition boundary.

## Start From Source

Requires Node.js 24+ and pnpm 10; the repository development toolchain is pinned to Node.js 24.18.0 LTS.

Native Desktop package and release targets are limited to:

| System | Architecture | Current Desktop qualification                                      |
| ------ | ------------ | ------------------------------------------------------------------ |
| macOS  | ARM64        | Forge package verified; Developer ID/notarized Release is gated    |

Windows x64 and Linux run typecheck, orchestration, SQLite, and host-neutral CI only. They do not
invoke Forge or produce a Desktop artifact. Intel Mac and other architectures are unsupported.

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

`pnpm build`, `pnpm dev:desktop`, `pnpm package:desktop`, and `pnpm make:desktop` run only on Apple
Silicon macOS. Windows/Linux use the CI platform test or `pnpm check:static-build` for deterministic
validation.

Common validation commands:

```bash
pnpm test
pnpm check
pnpm gate:local
```

## Development And Release

Every non-empty branch name other than `main` is a development branch. Ordinary development-branch pushes do not run GitHub Actions; run `pnpm gate:local` before pushing, and dispatch CI manually when GitHub-runner evidence is needed. `main` is the only release branch and accepts Pull Requests from development branches. `Merge Gate` must complete all source checks.

The formal Release workflow accepts only an exact `v<Desktop version>` tag reachable from `main`.
It creates a GitHub Release only after Developer ID signing, hardened runtime, notarization,
stapling, Gatekeeper assessment, ZIP verification, and SHA-256 generation on Apple Silicon. Missing
Apple credentials fail visibly; local package/make output remains ad-hoc signed and is not public
release evidence.

## Project Entries

- [OpenNeko Desktop](./apps/neko-desktop/): the sole application composition root for visual creation, editing, preview, and Agent collaboration.

## Repository Layout

- `apps/neko-desktop`: the only Electron application composition root; it owns Host lifecycle, typed IPC, security boundaries, and the product shell.
- `packages/<family>/<role>`: domain families with independent dependency closures, such as `packages/agent/runtime` and `packages/assets/webview`.
- `packages/<name>`: single-closure packages such as `packages/media`, `packages/shared`, and `packages/ui`.
- `quality/`: machine-readable package roles, test ownership, and debt ledgers; it is not a runtime package.
- `openspec/changes/`: changes still under design or implementation.

All internal packages use the `@neko/*` scope. Grouped packages use
`@neko/<family>-<role>` and singleton packages use `@neko/<name>`. Legacy scopes, directory aliases,
and direct `packages/**/src` imports are not supported. See
[Package roles and naming](./docs/architecture/package-taxonomy.md) and
[Package boundaries](./docs/architecture/package-boundaries.md).

## Documentation and Contributing

- [Documentation index](./docs/README.md)
- [Desktop development roadmap](./ROADMAP.md)
- [Contributing](./CONTRIBUTING.md)
- [Active product and feature changes](./openspec/changes/)
- [Repository development rules](./AGENTS.md)

Contributions grounded in real creative workflows are welcome, including reproducible issues, Skills, model integrations, creative capabilities, tests, and documentation improvements.

## License

OpenNeko is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE).
