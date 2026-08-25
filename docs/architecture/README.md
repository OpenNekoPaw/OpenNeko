# 架构文档

`docs/architecture/` 用于记录系统级架构约束、ADR 和跨领域不变量。根目录 [`../../README_CN.md`](../../README_CN.md) 介绍项目和当前能力；本目录是当前系统架构、决策记录和专题说明的稳定入口。

Electron Desktop 是唯一应用宿主。当前 composition、依赖、发布和验收路径以
`application-composition.md`、`client-targets.md` 和 `package-boundaries.md` 为准；本目录
不保留已退出产品拓扑的宿主设计或已取代 ADR。

Desktop 本地内容投影以统一 `openneko:` scheme 和 exact-resource registry 为唯一 canonical
transport；`ContentLocator`、领域身份和短生命周期 opaque URL 保持分离。完整安全与
consumer 路径见 `media-runtime.md`、Desktop 媒体 ADR、package boundaries 和 application
composition。

## 放入本目录

- Electron Main/preload/renderer、Node/FFmpeg 媒体运行时、共享契约之间的边界。
- Protobuf、路径系统、资源 URI、媒体授权等跨层约束。
- 影响多个领域或多个包的 ADR。
- 全局质量门禁、安全边界、依赖方向和运行时策略。

## Accepted 当前约束

下表只列当前已接受的系统约束和稳定专题说明。带“目标架构，分阶段实施中”或“部分实施”
标记的 Accepted ADR 仍是约束，但其未完成范围必须由活跃 OpenSpec 跟踪。Proposed 不在本表
中，不能作为已经实施的代码事实或验收结论。

| 文档                                                                                                                                           | 内容                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`adr-ai-native-product-surface-and-capability-composition-boundary.md`](adr-ai-native-product-surface-and-capability-composition-boundary.md) | AI Native 产品入口、正交能力、真实运行时注入与直接操纵 UI 的简化边界                                                        |
| [`adr-preview-3d-reference-staging-boundary.md`](adr-preview-3d-reference-staging-boundary.md)                                                 | Preview 形象、动作、机位、720°场景参考、内置预设及用途隔离边界                                                              |
| [`adr-code-debt-redundancy-governance.md`](adr-code-debt-redundancy-governance.md)                                                             | 重复、冗余、兼容桥和 fallback 代码的分类、清理优先级与验证规则                                                              |
| [`adr-code-review-quality-gates.md`](adr-code-review-quality-gates.md)                                                                         | 代码审查、风险分级、验证矩阵和功能偏离检查                                                                                  |
| [`adr-local-metadata-store-sqlite.md`](adr-local-metadata-store-sqlite.md)                                                                     | 用户级 SQLite、同步项目事实、可删除项目 `.neko` 与缓存索引边界                                                              |
| [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md)     | Phase 1 Desktop 组合根、现有子包复用方式及 OpenCode、Zed、Craft Agents、Goose 等参考边界                                    |
| [`adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md`](adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md)                         | Cut 以原生 HTML video Range、Node/FFmpeg preparation、PCM 和双槽切换统一媒体运行时的目标边界                                |
| [`application-composition.md`](application-composition.md)                                                                                     | 唯一 Electron Desktop composition root、一级包、Main/preload/renderer 依赖方向及 app-lifetime exact-resource registry owner |
| [`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md)                                                     | 统一 GFM 语义契约、Milkdown/CodeMirror/Agent message surface 分工、资源增强渲染和 Send to Canvas 边界                       |
| [`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md)                             | Canvas 预览路线矩阵、Cut 剪辑时间线、Agent 顺序感知和跨包协议边界                                                           |
| [`adr-ui-domain-panels-and-shared-primitives.md`](adr-ui-domain-panels-and-shared-primitives.md)                                               | 创作领域面板与共享 UI 原语的复用边界                                                                                        |
| [`agent.md`](agent.md)                                                                                                                         | Agent runtime、输入、创作、Tool/Job、Skill/MCP、Prompt、信任与生命周期的统一横切架构                                        |
| [`asset-library.md`](asset-library.md)                                                                                                         | 媒体库逻辑 locator、本机 binding、全局连接，以及本地版本化素材包与搜索投影                                                  |
| [`auth.md`](auth.md)                                                                                                                           | 无独立 Auth 产品时的用户凭据、workspace policy、host adapter 和 session 边界                                                |
| [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)                                                                             | 项目/媒体 locator、`.neko` 本机 binding、派生存储、窄内容读写与 Webview 投影                                                |
| [`client-targets.md`](client-targets.md)                                                                                                       | OpenNeko Desktop 的产品目标、职责边界和验证重点                                                                             |
| [`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md)                                                         | 资源、Project Entity、Character 与 World 的简化用户模型、唯一 owner、创建、关联、引用和页面边界                             |
| [`media-runtime.md`](media-runtime.md)                                                                                                         | Node/FFmpeg、OpenNeko Range/PCM、原生媒体 consumer、编解码、10-bit/HDR hardware preparation 和损坏范围边界                  |
| [`headless-project-authoring.md`](headless-project-authoring.md)                                                                               | `.nk*` 持久项目写入的无 UI authoring 边界、operation 分类、canonical 入口和客户端适配                                       |
| [`package-boundaries.md`](package-boundaries.md)                                                                                               | owning package、UI 层、公共代码、Desktop OpenNeko resource capability、Node 媒体运行时约束和验证命令                        |
| [`package-taxonomy.md`](package-taxonomy.md)                                                                                                   | Workspace package 角色、拆包条件、领域家族命名、显式 exports 与产品状态语义                                                 |
| [`proto-and-wire-contracts.md`](proto-and-wire-contracts.md)                                                                                   | Wire contract、package-owned contract、项目格式与未来 Proto 准入条件                                                        |
| [`ui-theme-i18n-error-logging.md`](ui-theme-i18n-error-logging.md)                                                                             | UI 公共层、主题 token、国际化、错误处理、日志和诊断边界                                                                     |
| [`unified-entity.md`](unified-entity.md)                                                                                                       | 最小 Project Entity、候选、representation binding、Character/World 关联边界和搜索投影                                       |

机器可读的质量门禁输入放在 [`../../quality/`](../../quality/)，例如代码债务台账、Agent 扩展能力 surface 和 Agent 边界 LCD register；本目录只保留人类可读的架构决策和规则说明。

## 不放入本目录

| 内容                         | 应放位置                                |
| ---------------------------- | --------------------------------------- |
| 单个领域内部架构             | `docs/domains/<domain>/architecture.md` |
| 尚未稳定的开发变更           | `openspec/changes/`                     |
| 供脚本和 CI 消费的 JSON 台账 | `quality/`                              |
| 单包实现细节                 | 代码、测试与必要的简短注释              |
| Package 公共入口与使用方式   | package 根目录的简短 `README.md`        |

## 写作要求

架构文档应说明当前决策、约束、风险和后果。避免保存过时代码样例、命令输出、阶段完成日志或只对单次实现有意义的状态。

当领域决策上升为全系统约束时，将稳定结论提升到本目录，并从对应 `docs/domains/<domain>/` 文档链接回来。
