# 参与 OpenNeko

感谢你为 OpenNeko 提交真实创作场景、可复现问题、代码、Skill、模型接入、测试或文档改进。

## 开始之前

仓库的详细架构、安全、质量和完成定义以 [`AGENTS.md`](AGENTS.md) 为准。开始修改前请先阅读：

- [`README_CN.md`](README_CN.md)：产品定位与当前能力；
- [`docs/README.md`](docs/README.md)：文档导航；
- [`docs/architecture/application-composition.md`](docs/architecture/application-composition.md)：Desktop-only 组合边界；
- [`docs/architecture/package-boundaries.md`](docs/architecture/package-boundaries.md)：包职责与依赖方向；
- [`openspec/changes/`](openspec/changes/)：正在设计或实施的产品功能变更。

OpenSpec 只用于能够独立命名并改变系统能力边界、核心产品工作流、持久用户事实或安全/信任边界的系统级或产品级功能变更，并且必须在实施前建立。提案只保存产品意图、系统边界和产品级验收。

局部 UI/交互细节、缺陷修复、性能优化、行为等价重构与清理、包/目录/内部 contract 调整、测试/质量门禁、构建/依赖/开发工具及 inventory/audit/status 不得创建或扩写 OpenSpec。此类改动直接修改代码和测试，在提交、PR 或交付说明中记录必要证据，不新增状态、调研或 verification 文档。

代码已经形成 canonical path、提案只剩局部修补或补充验证时，应删除 proposal；只有系统架构或核心产品设计结论可以提升到稳定文档。不得保留 archive、implementation evidence、verification、evaluation 或历史任务副本。

OpenSpec task 只保留少量产品级里程碑和最终验收，不记录文件、类/函数、逐提交步骤、命令结果、日期化证据或实现进度。实际业务逻辑、功能实现和实现状态以代码与测试为准。

长期文档只描述当前 canonical 架构、开发规范和核心产品设计。不得保留已删除包、路径、协议或提案的
历史说明，不保存迁移阶段、完成状态、Accepted/Deprecated 标签和更新时间；文件名必须匹配当前职责。
当前 package 清单、产品可达状态和实现进度以代码、测试及机器台账为准。

触及 `apps/*`、`packages/*` 或 `packages/*/*` 生产模块时，交付 review 必须记录 owning responsibility、
package role、canonical public path、producer/consumer、runtime boundary、旧路径删除/poison 条件、用户数据
语义与验证命令。OpenSpec 只保留稳定产品边界和产品级里程碑，不复制交付 review 的实现证据。仅说明
“当前只有 Desktop”或只给最终测试结果不算完成证据。

内部 package 统一使用 `@neko/*`。新增或移动 package 前先更新 `quality/package-roles.json`；消费方
必须使用 manifest 中显式声明的 public export，不得直接导入 `packages/**/src`，也不得增加旧 scope、
TypeScript path alias 或兼容 re-export。

单 package owner 只使用 `packages/<name>`；一旦拆出独立 role，必须在同一变更中转换为纯
`packages/<family>/<role>` family，family 根不得包含 `package.json`。禁止新增
`packages/<family>-<role>` 平铺 package、根 package 与 nested role 混合、跨多个物理根的同一 family，
也不得把仓库中尚未迁移的历史路径当作先例。移动或删除 package 时还必须清除精确旧 root 下可重建的
build/cache/package-local dependency 残留并验证旧目录消失，不得用模糊 glob 触及用户数据或无关 package。

## 本地开发

要求 Node.js 24+ 和 pnpm 10。

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

只修改与任务有关的文件，不要覆盖工作区中不属于你的改动。Renderer/Webview 不得直接访问 Electron 或 Node API；宿主能力必须通过最小 typed Desktop port 提供。

## 验证

UI 验收以人工操作真实应用为主。自动化测试应验证实际行为、状态变化、错误传播和资源生命周期；文档措辞、CSS 数值、选择器存在或截图名称不能作为功能通过的证据。不得为了让测试通过而放宽产品错误处理、增加测试专用成功路径或隐藏失败。

按影响范围选择验证，不能只以单元测试通过作为非平凡变更的完成证据：

```bash
pnpm test
pnpm check
pnpm gate:local
pnpm package:desktop
```

纯文档修改至少运行格式、链接和 `git diff --check`。涉及 Desktop 视觉、交互、CSP、IPC、焦点或媒体时，
必须在真实 Electron 应用中运行受影响功能路径；浏览器或组件预览只能补充纯浏览器证据。视觉评价仍为推荐、非阻塞参考。

新增或实质修改用户可见 UI 时，应在真实 Electron 中人工检查受影响功能、视觉状态和相邻功能。
Desktop trust、preload、IPC、窗口/焦点、原生资源、持久化或生命周期必须沿真实产品路径验证；
浏览器或组件预览只能作为补充。截图存在、文件名、DOM 数据或脚本成功不能替代实际操作和视觉审阅。
失败、阻塞、缺失或未执行的项目必须明确记录，不得声明已通过。没有用户可见影响时说明不适用原因。
视觉评价仅作非阻塞参考，不替代功能、契约、安全与代码门禁；图形化执行不得加入通用 CI/gate。

Agent 的确定性验证使用 owning package 测试与 DSH qualification；真实行为由开发者在完整装配的 Electron 中人工验证，不得加入 GitHub Actions 或通用 CI/gate。确定性测试不能替代真实 Agent 行为证据。真实 API 唯一读取 `~/.neko/config.toml`，凭据由产品配置 owner 解析；执行前必须明确 provider/model 与本次 API 成本授权。

Agent 用户功能验收必须从可见 Electron UI 的真实控件发起并调用真实 API，不得改用 direct turn runner 或 mock 作为功能验收。基础矩阵包括真实对话、上下文压缩、完整重开后的对话记录、生成记录恢复、会话切换展示和会话隔离；交付时列出已覆盖项、未执行项和剩余风险。

## 提交说明

交付或 Pull Request 应说明变更摘要、关键设计、验证命令与结果、未执行项和剩余风险。影响当前能力、架构、契约或入口时，同步对应的中文文档；英文入口语义受影响时同步英文版本。
