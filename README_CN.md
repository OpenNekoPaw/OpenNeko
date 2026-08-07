# OpenNeko

> Agent 驱动的内容创作平台

[English](./README.md)

![Status](https://img.shields.io/badge/Status-Alpha-orange)
[![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue)](./LICENSE)

OpenNeko 是一款本地优先的桌面应用，用于管理项目与内容，并在同一个工作区中连接 Agent、素材库与创作工具。

![OpenNeko Desktop：按项目与助手分类的会话导航](./docs/assets/openneko-desktop.png)

使用 OpenNeko，你可以：

- 在侧栏分别管理项目上下文会话与个人助手会话；
- 让 Agent 理解当前项目并协助生成、分析和迭代内容；
- 管理素材与生成结果，并在画布或视频时间线中继续处理；
- 将项目文件保留在本地，预览、导出或交给专业工具继续创作。

## 当前能力

| 能力         | 你可以做什么                                           |
| ------------ | ------------------------------------------------------ |
| 项目与会话   | 分区管理项目上下文会话和个人助手会话                   |
| 创作 Agent   | 基于项目上下文对话、规划任务、调用工具和生成内容       |
| 工具与 API   | 配置云端或本地 AI API，并让 Agent 使用已支持的本地工具 |
| Skill 与扩展 | 管理个人 Skill 和 OpenNeko 扩展                        |
| 素材库与画布 | 组织素材、文档、生成结果和创作结构                     |
| 视频时间线   | 编排、预览并导出轻量音视频项目                         |
| 内容预览     | 查看常用文档、图片、音视频和受支持的 3D 模型           |

可用的生成与理解能力取决于你配置的 API、模型权限和本地服务。

## 当前状态

- **Alpha**：目前以源码体验和产品验证为主，界面与项目格式仍可能变化。
- **平台**：当前只支持 Apple Silicon macOS；预览版尚未进行 Developer ID 签名和 Apple 公证。
- **产品重点**：当前提供项目与个人助手入口；Character、Room 与 World 是未来方向，尚未开放对应产品栏目。
- **开发中**：完整端到端创作闭环、稳定发布通道和专业工具集成尚未完成。

## 从源码开始

需要 Apple Silicon macOS、Node.js 24.18.0 LTS 和 pnpm 10.29.2。

```bash
corepack enable
pnpm install
pnpm build
pnpm dev:desktop
```

## 了解更多

- [文档导航](./docs/README.md)
- [Desktop 开发路线图](./ROADMAP_CN.md)
- [参与开发](./CONTRIBUTING_CN.md)
- [系统架构](./docs/architecture/README.md)

欢迎提交真实创作场景、可复现问题、Skill、模型接入、创作能力、测试和文档改进。

## License

OpenNeko 使用 GNU Affero General Public License v3.0 or later，详见 [LICENSE](./LICENSE)。
