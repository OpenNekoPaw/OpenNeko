# OpenNeko

> A local-first, Agent-driven, open-source content creation workspace.

[中文](./README_CN.md)

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)](./LICENSE)

OpenNeko is for creators who want control over their project files, model connections, and creative workflow. Instead of being another online model aggregation platform, it lets an Agent understand a local project, invoke creative capabilities, and move generated results into a canvas, asset library, timeline, and preview tools for continued work.

## Key Ideas

- **Local projects first**: assets, characters, project context, and creative outputs are organized around the local workspace.
- **Bring your own AI services**: configure external APIs, compatible APIs, or local API services without being tied to one model platform.
- **Agent-driven creation**: the Agent can understand the current project, plan tasks, invoke tools, and help generate, analyze, and iterate content.
- **A continuous workflow**: generated content can move into the canvas, asset library, and video timeline for editing, preview, and export.

## Current Capabilities

| Capability            | What it provides                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Creative Agent        | Project conversations, task planning, tool use, and media generation                         |
| Canvas                | Organize ideas, references, storyboards, media, and generated results                        |
| Video Timeline        | Arrange audio, video, effects, and transitions, then preview and export                      |
| Assets and Characters | Manage media, characters, variants, references, and reusable packs                           |
| Preview and Tools     | Preview common media, documents, and standard 3D models, compare assets, and return feedback |

Available generation and understanding features depend on your configured APIs, model access, and local services.

## Project Status

OpenNeko is currently in **Alpha** and is primarily intended for source-based previews and product validation. The core creative workflow is running, while installation, upgrades, compatibility, interfaces, and project formats may still change. OpenNeko TUI is also used to validate Agents, models, Skills, and workflows.

## Start From Source

Requires Node.js 24+, pnpm 10, and VS Code 1.128+; the repository development toolchain is pinned to Node.js 24.18.0 LTS.

Supported release platforms are limited to:

| System | Architecture | Release target |
| ------ | ------------ | -------------- |
| macOS  | ARM64        | `darwin-arm64` |
| Linux  | x64          | `linux-x64`    |

Windows support is deferred and no Windows release package is currently provided. Restoring it requires native build, VSIX startup, and Engine media read/export validation on a real Windows environment. Intel Macs, Linux ARM64/musl, and other systems or architectures also do not receive release packages.

```bash
pnpm install
pnpm build
```

Common validation commands:

```bash
pnpm test
pnpm check
pnpm gate:local
```

## Development And Release

`dev` is the normal development branch. Ordinary pushes do not run GitHub Actions; run `pnpm gate:local` before pushing, and dispatch CI manually when GitHub-runner evidence is needed. `main` is the release branch and only accepts `dev -> main` Pull Requests. `Merge Gate` must complete all source checks and package the `darwin-arm64` and `linux-x64` VSIX artifacts before merge.

Formal releases are triggered by `v*` tags reachable from main. The Release workflow validates tag ancestry and extension manifest versions, rebuilds the release VSIX artifacts and `SHA256SUMS`, then creates the GitHub Release through the `release` environment.

## Project Entries

- [OpenNeko Creative Workspace](./apps/neko-vscode/): visual creation, editing, preview, and Agent collaboration.
- [OpenNeko TUI](./apps/neko-tui/): terminal experiments for Agents, models, Skills, and workflows.

## Documentation and Contributing

- [Documentation index](./docs/README.md)
- [Active product and feature changes](./openspec/changes/)
- [Repository development rules](./AGENTS.md)

Contributions grounded in real creative workflows are welcome, including reproducible issues, Skills, model integrations, creative capabilities, tests, and documentation improvements.

## License

OpenNeko is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE).
