# OpenNeko

> An Agent-driven content creation platform

[中文](./README_CN.md)

![Status](https://img.shields.io/badge/Status-Alpha-orange)
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)](./LICENSE)

OpenNeko is a local-first desktop app for managing projects and content while bringing Agents,
media libraries, and creative tools into one workspace.

![OpenNeko Desktop: conversations organized by project and assistant](./docs/assets/openneko-desktop.png)

With OpenNeko, you can:

- manage project-context conversations and personal-assistant conversations in separate sidebar sections;
- let an Agent understand the current project and help generate, analyze, and iterate content;
- manage source material and generated results, then continue working in the Canvas or video timeline;
- keep project files local, preview or export results, and hand work off to professional tools.

## Current Capabilities

| Capability                 | What you can do                                                              |
| -------------------------- | ---------------------------------------------------------------------------- |
| Projects and conversations | Manage project-context and personal-assistant conversations separately       |
| Creative Agent             | Chat in project context, plan tasks, use tools, and generate content         |
| Tools and APIs             | Configure cloud or local AI APIs and let the Agent use supported local tools |
| Skills and extensions      | Manage personal Skills and OpenNeko extensions                               |
| Media Library/Canvas       | Organize assets, documents, generated results, and structure                 |
| Video timeline             | Arrange, preview, and export lightweight audio/video projects                |
| Content preview            | View common documents, images, audio/video, and supported 3D models          |

Available generation and understanding features depend on your configured APIs, model access, and local services.

## Project Status

- **Alpha**: currently intended for source-based previews and product validation; interfaces and project formats may change.
- **Platform**: Apple Silicon macOS only; preview builds are not Developer ID signed or Apple notarized.
- **Product focus**: Projects and Personal Assistant are available now; Character, Room, and World remain future directions and are not exposed as product sections yet.
- **In development**: the complete end-to-end workflow, stable release channel, and professional-tool integrations.

## Start From Source

Requires Apple Silicon macOS, Node.js 24.18.0 LTS, and pnpm 10.29.2.

```bash
corepack enable
pnpm install
pnpm build
pnpm dev:desktop
```

## Learn More

- [Documentation index](./docs/README.md)
- [Desktop development roadmap](./ROADMAP.md)
- [Contributing](./CONTRIBUTING.md)
- [System architecture](./docs/architecture/README.md)

Contributions grounded in real creative workflows are welcome, including reproducible issues, Skills, model integrations, creative capabilities, tests, and documentation improvements.

## License

OpenNeko is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE).
