# 参与 OpenNeko

感谢你为 OpenNeko 提交真实创作场景、可复现问题、代码、Skill、模型接入、测试或文档改进。

## 开始之前

仓库的详细架构、安全、质量和完成定义以 [`AGENTS.md`](AGENTS.md) 为准。开始修改前请先阅读：

- [`README_CN.md`](README_CN.md)：产品定位与当前能力；
- [`docs/README.md`](docs/README.md)：文档导航；
- [`docs/architecture/application-composition.md`](docs/architecture/application-composition.md)：Desktop-only 组合边界；
- [`docs/architecture/package-boundaries.md`](docs/architecture/package-boundaries.md)：包职责与依赖方向；
- [`openspec/changes/`](openspec/changes/)：正在设计或实施的变更。

非平凡功能、跨包修改、公共契约或架构变更必须先建立或更新 OpenSpec artifacts。简单文档和局部修正可以直接实施，但仍需符合当前架构。

## 本地开发

要求 Node.js 24+ 和 pnpm 10。

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

只修改与任务有关的文件，不要覆盖工作区中不属于你的改动。Renderer/Webview 不得直接访问 Electron 或 Node API；宿主能力必须通过最小 typed Desktop port 提供。

## 验证

按影响范围选择验证，不能只以单元测试通过作为非平凡变更的完成证据：

```bash
pnpm test
pnpm check
pnpm gate:local
pnpm package:desktop
```

纯文档修改至少运行格式、链接和 `git diff --check`。涉及 Desktop 视觉、交互、CSP、IPC、焦点或媒体时，还必须在真实 Electron 应用中完成聚焦验收。

## 提交说明

交付或 Pull Request 应说明变更摘要、关键设计、验证命令与结果、未执行项和剩余风险。影响当前能力、架构、契约或入口时，同步对应的中文文档；英文入口语义受影响时同步英文版本。
