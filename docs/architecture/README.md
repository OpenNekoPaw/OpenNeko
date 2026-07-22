# 架构文档

`docs/architecture/` 用于记录系统级架构约束、ADR 和跨领域不变量。根目录 [`../../README_CN.md`](../../README_CN.md) 介绍项目和当前能力；本目录是当前系统架构、决策记录和专题说明的稳定入口。

## 放入本目录

- Webview、Extension Host、Rust Engine、共享契约之间的边界。
- Protobuf、路径系统、资源 URI、Engine 权威等跨层约束。
- 影响多个领域或多个包的 ADR。
- 全局质量门禁、安全边界、依赖方向和运行时策略。

## 当前核心文档

| 文档                                                                                                               | 内容                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [`adr-agent-idc-skill-planmode-trigger-boundary.md`](adr-agent-idc-skill-planmode-trigger-boundary.md)             | 已被 Agent 动态创作编排 ADR 取代的 IDC/Plan 历史边界                                  |
| [`adr-agent-autonomous-filmmaking-creation-boundary.md`](adr-agent-autonomous-filmmaking-creation-boundary.md)     | 已被 Agent 动态创作编排 ADR 取代的影视创作历史边界                                    |
| [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)                             | Agent 消息队列、任务队列与任务卡的展示位置、权威来源和操作边界                        |
| [`adr-agent-internal-continuation-boundary.md`](adr-agent-internal-continuation-boundary.md)                       | Agent 内部续跑、消息队列、异步任务结果和 subagent 回传边界                            |
| [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)   | Agent runtime 对比 Codex/OpenCode/Pi/OpenClaw/Hermes 等后的本地边界、协议面和演进约束 |
| [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)                                                               | Pi 作为唯一 Agent/LLM/Skill/Session canonical path，及模型、路径、凭据和产品职责边界  |
| [`adr-agent-creative-invocation-run-boundary.md`](adr-agent-creative-invocation-run-boundary.md)                   | Agent 创作包 AI 调用、document/run 边界、ResourceRef 结果和 package-owned 写回约束    |
| [`adr-canvas-creative-ai-candidate-actions.md`](adr-canvas-creative-ai-candidate-actions.md)                       | Canvas Shot/Scene AI 按钮、candidate-first 写回、后台 Agent run、媒体并发和晋升边界   |
| [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)                 | Agent Skill catalog、用户新增 Skill metadata 和激活权威边界                           |
| [`adr-agent-skill-creator-and-validation.md`](adr-agent-skill-creator-and-validation.md)                           | 开放 Agent Skill 格式、原生创建、可选 Neko overlay、校验和 Host 边界                  |
| [`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)                     | Agent 默认提示词、Skill 提示词、Validator 和 Capability 的职责边界                    |
| [`adr-agent-native-creation-capability-boundary.md`](adr-agent-native-creation-capability-boundary.md)             | 已取代：Agent 原生创作边界的历史过渡设计                                               |
| [`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md) | Agent 动态创作编排、能力感知及影视化/动画化领域能力与完成事实边界 |
| [`adr-agent-command-skill-trigger-boundary.md`](adr-agent-command-skill-trigger-boundary.md)                       | Agent `/` 命令、`$` 技能和 `@` 上下文引用的触发入口边界                               |
| [`adr-agent-driven-avatar-preview-runtime-boundary.md`](adr-agent-driven-avatar-preview-runtime-boundary.md)       | Agent 统一驱动 Live2D/VRM/GLB、TTS/STT、只读运行时与 MMD 延后边界                      |
| [`adr-preview-3d-reference-staging-boundary.md`](adr-preview-3d-reference-staging-boundary.md)                     | Preview 形象、动作、机位、720°场景参考、内置预设及用途隔离边界                        |
| [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)   | Agent 资源沙箱、外部处理器、命令执行和审批边界                                        |
| [`adr-code-debt-redundancy-governance.md`](adr-code-debt-redundancy-governance.md)                                 | 重复、冗余、兼容桥和 fallback 代码的分类、清理优先级与验证规则                        |
| [`adr-code-review-quality-gates.md`](adr-code-review-quality-gates.md)                                             | 代码审查、风险分级、验证矩阵和功能偏离检查                                            |
| [`adr-local-metadata-store-sqlite.md`](adr-local-metadata-store-sqlite.md)                                         | 用户级 SQLite 本地元数据 Store、项目事实和缓存索引边界                                |
| [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md) | 拟议新增 Desktop 组合根、现有子包复用方式及 Craft Agents 等开源参考边界 |
| [`adr-cut-otio-vscode-media-runtime-boundary.md`](adr-cut-otio-vscode-media-runtime-boundary.md) | Cut 以 OTIO 为唯一工程、VS Code 保留 Engine adapter，并通过同源 MP4 引用完成显式逻辑音频分离 |
| [`application-composition.md`](application-composition.md)                                                       | TUI、OpenNeko for VS Code 两个应用 composition root 和依赖方向                       |
| [`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md)                         | Canvas MCP 式能力、Markdown 扩展语法、资源增强渲染和 Send to Canvas 边界              |
| [`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md) | Canvas 预览路线矩阵、Cut 剪辑时间线、Agent 顺序感知和跨包协议边界                     |
| [`adr-ui-domain-panels-and-shared-primitives.md`](adr-ui-domain-panels-and-shared-primitives.md)                   | 创作领域面板与共享 UI 原语的复用边界                                                  |
| [`adr-asset-library-sources-and-unified-entity-boundary.md`](adr-asset-library-sources-and-unified-entity-boundary.md) | 单一媒体库、ContentLocator 与统一实体的职责和迁移边界                             |
| [`agent.md`](agent.md)                                                                                             | Agent-first、execution mode、skill/prompt/tool/provider 控制面和宿主分层              |
| [`asset-library.md`](asset-library.md)                                                                             | 媒体库、工作区 link、内容访问、显式文件操作和搜索投影                              |
| [`auth.md`](auth.md)                                                                                               | 无独立 Auth 产品时的用户凭据、workspace policy、host adapter 和 session 边界           |
| [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)                                                 | 派生存储、窄内容读写服务、路径变量和 Webview 投影                                      |
| [`client-targets.md`](client-targets.md)                                                                           | TUI、OpenNeko for VS Code 的产品目标、职责边界和验证重点                              |
| [`engine-runtime.md`](engine-runtime.md)                                                                           | 裁剪后的 Rust Media Engine、Host API、文件/Range、编解码和数据路径                    |
| [`headless-project-authoring.md`](headless-project-authoring.md)                                                   | `.nk*` 持久项目写入的无 UI authoring 边界、operation 分类、canonical 入口和客户端适配 |
| [`package-boundaries.md`](package-boundaries.md)                                                                   | 子包边界、UI 层、公共代码、Extension/Webview/Engine 约束和验证命令                    |
| [`proto-and-wire-contracts.md`](proto-and-wire-contracts.md)                                                       | Proto、wire contract、生成类型、UI projection 和项目格式关系                          |
| [`ui-theme-i18n-error-logging.md`](ui-theme-i18n-error-logging.md)                                                 | UI 公共层、主题 token、国际化、错误处理、日志和诊断边界                               |
| [`unified-entity.md`](unified-entity.md)                                                                           | 统一实体、候选、实体素材绑定、视觉草案、展示投影和搜索投影                            |
| [`webview-media-security.md`](webview-media-security.md)                                                           | VS Code Webview CSP、媒体格式兼容、Range 和 Engine 媒体访问约束                       |

## 历史/已取代 ADR

| 文档                                                                                     | 取代说明                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md) | Desktop 产品壳已删除；当前边界由 application composition、package boundaries 与 Media Engine 文档接续 |
| [`adr-neko-workbench-core-plugin-host.md`](adr-neko-workbench-core-plugin-host.md) | Workbench Core 与 Desktop Plugin Host 已随产品裁剪删除；仅保留为历史设计背景 |
| [`marketplace.md`](marketplace.md) | Market/Registry 客户端、Market Core 和安装面已删除；仅保留为历史产品设计背景 |
| [`adr-markdown-storyboard-draft-protocol.md`](adr-markdown-storyboard-draft-protocol.md) | 已被 [`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md) 和 Canvas `canvas.ingestMarkdown` / Creative Table profile 方案取代；仅保留为历史背景，不作为新实现入口 |

机器可读的质量门禁输入放在 [`../../quality/`](../../quality/)，例如代码债务台账和 Agent 边界 LCD register；本目录只保留人类可读的架构决策和规则说明。

## 不放入本目录

| 内容                           | 应放位置                                |
| ------------------------------ | --------------------------------------- |
| 单个领域内部架构               | `docs/domains/<domain>/architecture.md` |
| 竞品、市场、技术调研           | `docs/research/`                        |
| 当前 gap、迁移进度、健康度快照 | `docs/status/`                          |
| 尚未稳定的开发变更             | `openspec/changes/`                     |
| 供脚本和 CI 消费的 JSON 台账   | `quality/`                              |
| 单包实现细节                   | `packages/<pkg>/docs/`                  |

## 写作要求

架构文档应说明当前决策、约束、风险和后果。避免保存过时代码样例、命令输出、阶段完成日志或只对单次实现有意义的状态。

当领域决策上升为全系统约束时，将稳定结论提升到本目录，并从对应 `docs/domains/<domain>/` 文档链接回来。
