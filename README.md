# OpenNeko

> A local-first AI workspace, from conversation to creation

[中文](./README_CN.md)

![Status](https://img.shields.io/badge/Status-Alpha-orange)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

OpenNeko is an Agent-driven desktop app that brings conversations, project files, assets, and a canvas into one workspace.
Discuss ideas with an Agent, analyze references, generate content, and continue creating in the canvas, text editor, or video timeline.

![OpenNeko conversation entry: switch between conversation and creation, choose a model, and describe your idea](./docs/assets/openneko-conversation.png)

_Start in conversation or creation mode, choose a model, and describe what you want to create._

## What You Can Do

| Capability                | Purpose                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Conversation and creation | Start an everyday conversation or select a project for the Agent to work with                             |
| Projects and works        | Organize local project files and find and open creative content in the project browser                    |
| Creative Agent            | Analyze references, plan tasks, use tools, and generate content with your configured models               |
| Assets and canvas         | Arrange reference images, documents, and generated results on a canvas, connect them, and preview content |
| Documents and media       | Edit text and preview common documents, images, audio/video, and supported 3D models                      |
| Video timeline            | Arrange, preview, and export lightweight audio/video projects                                             |
| Models and extensions     | Configure cloud or local AI services and manage personal Skills and OpenNeko extensions                   |

Project files stay local. AI conversation, generation, and understanding depend on your configured services, model access, and network availability. When you use a cloud model, relevant inputs are sent to the selected service.

<details>
<summary>Explore the creative workspace: Agent, canvas, and project browser</summary>

![OpenNeko creative workspace: Agent conversation on the left, an asset and document canvas in the center, and the project browser on the right](./docs/assets/openneko-desktop.png)

Connect Agent conversations, reference material, generated results, and creative documents within one project.

</details>

## Project Status

- **Alpha**: currently intended for source-based previews and product validation; interfaces and project formats may change.
- **Platform**: Apple Silicon macOS only; distributed DMGs are not Developer ID signed or Apple notarized.
- **Product focus**: Agents, projects, content, assets, and media creation. Character (Chara) and World currently have experimental entries only in development builds; complete character assistant creation and world experiences are not available yet.
- **In development**: the complete end-to-end workflow, stable release channel, and professional-tool integrations.

## Start From Source

Requires Apple Silicon macOS, Node.js 24.18.0 LTS, and pnpm 10.29.2.

```bash
corepack enable
pnpm install
pnpm build
pnpm dev:desktop
```

After launching, configure AI services and models in Settings at the bottom left. Then start a conversation or select a project to begin creating.
Model configuration and API keys are stored in the local `~/.neko/config.toml` file. API keys are plain text; product writes restrict file permissions to the current user. Do not share or commit this file. See [Contributing](./CONTRIBUTING.md) for development and validation details.

## Learn More

- [Documentation index](./docs/README.md)
- [Desktop development roadmap](./ROADMAP.md)
- [Contributing](./CONTRIBUTING.md)
- [System architecture](./docs/architecture/README.md)

Contributions grounded in real creative workflows are welcome, including reproducible issues, Skills, model integrations, creative capabilities, tests, and documentation improvements.

## License

OpenNeko is licensed under the MIT License. See [LICENSE](./LICENSE).
