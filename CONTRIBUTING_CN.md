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

触及 `apps/*`、`packages/*` 或 `packages/*/*` 生产模块时，OpenSpec design/tasks 和交付 review 必须记录 owning
responsibility、package role、canonical public path、producer/consumer、runtime boundary、旧路径
删除/poison 条件、用户数据语义与验证命令。仅说明“当前只有 Desktop”或只给最终测试结果不算完成证据。

内部 package 统一使用 `@neko/*`。新增或移动 package 前先更新 `quality/package-roles.json`；消费方
必须使用 manifest 中显式声明的 public export，不得直接导入 `packages/**/src`，也不得增加旧 scope、
TypeScript path alias 或兼容 re-export。

## 本地开发

要求 Node.js 24+ 和 pnpm 10。

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

只修改与任务有关的文件，不要覆盖工作区中不属于你的改动。Renderer/Webview 不得直接访问 Electron 或 Node API；宿主能力必须通过最小 typed Desktop port 提供。

Agent Evaluation 使用严格的声明式 suite、Scenario、assertion 和 ablation artifact。Skill 可以辅助覆盖判断和草案生成，但不得生成每 case 可执行脚本或拥有运行时协议；确定性解析保留在现有 runner，除非新的 OpenSpec 证明存在跨进程计划、多个真实后端或稳定缓存等独立编译边界。

## 验证

按影响范围选择验证，不能只以单元测试通过作为非平凡变更的完成证据：

```bash
pnpm test
pnpm check
pnpm gate:local
pnpm package:desktop
```

纯文档修改至少运行格式、链接和 `git diff --check`。涉及 Desktop 视觉、交互、CSP、IPC、焦点或媒体时，还必须在真实 Electron 应用中完成聚焦验收。

Agent Evaluation harness（包括 `pnpm test:agent:eval`）、真实 API、hidden/visible Desktop、重复 matrix、消融和图形化 Electron 验收只能由开发者显式本地运行，不得加入 GitHub Actions 或通用 CI/gate 命令。key-free 与 dry-run 结果只证明测试平台就绪，不代表真实 Agent 行为。真实 API 唯一读取 `~/.neko/config.toml`，配置路径不可重定向；凭据由产品配置 owner 解析，provider/model 与成本授权仍需显式提供。具体入口见 [`scripts/agent-eval/README.md`](scripts/agent-eval/README.md)。

Agent 用户功能验收必须从可见 Electron UI 的真实控件发起并调用真实 API；批量回归使用无可见 UI 的完整 Desktop session 与真实 API，不得改用 direct turn runner 或 mock。基础矩阵包括真实对话、上下文压缩、完整重开后的对话记录、生成记录恢复、会话切换展示和会话隔离；交付时列出已覆盖项、未执行项和剩余风险。

## 提交说明

交付或 Pull Request 应说明变更摘要、关键设计、验证命令与结果、未执行项和剩余风险。影响当前能力、架构、契约或入口时，同步对应的中文文档；英文入口语义受影响时同步英文版本。
