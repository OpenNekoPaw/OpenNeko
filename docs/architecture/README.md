# 架构文档

`docs/architecture/` 只记录当前系统级架构约束和跨领域不变量。根目录 [`../../README_CN.md`](../../README_CN.md)
介绍项目和当前能力；实现细节与实际行为以代码和测试为准。

Electron Desktop 是唯一应用宿主。当前 composition、依赖、发布和验收路径以
`application-composition.md`、`client-targets.md` 和 `package-boundaries.md` 为准。

Desktop 本地内容投影以统一 `openneko:` scheme 和 exact-resource registry 为唯一 canonical
transport；`ContentLocator`、领域身份和短生命周期 opaque URL 保持分离。完整安全与
consumer 路径见 `media-runtime.md`、content access、package boundaries 和 application
composition。

## 放入本目录

- Electron Main/preload/renderer、Node/FFmpeg 媒体运行时、共享契约之间的边界。
- Wire contract、路径系统、资源 URI、媒体授权等跨层约束。
- 影响多个领域或多个包的稳定架构决策。
- 全局质量门禁、安全边界、依赖方向和运行时策略。

## 当前约束

下表只列当前系统约束和稳定专题说明，不保存迁移状态、完成记录或历史方案。

| 文档                                                                                   | 内容                                                                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`development-quality.md`](development-quality.md)                                     | 开发变更分类、审查原则、风险分级和验证入口                                                                                  |
| [`local-metadata-and-project-facts.md`](local-metadata-and-project-facts.md)           | 用户级 SQLite、同步项目事实、可删除项目 `.neko` 与缓存索引边界                                                              |
| [`application-composition.md`](application-composition.md)                             | 唯一 Electron Desktop composition root、一级包、Main/preload/renderer 依赖方向及 app-lifetime exact-resource registry owner |
| [`agent.md`](agent.md)                                                                 | Agent runtime、输入、创作、Tool/Job、Skill/MCP、Prompt、信任与生命周期的统一横切架构                                        |
| [`asset-library.md`](asset-library.md)                                                 | 媒体库逻辑 locator、本机 binding、全局连接，以及本地版本化素材包与搜索投影                                                  |
| [`credentials.md`](credentials.md)                                                     | 用户凭据、workspace policy、host adapter 和 session 边界                                                                    |
| [`content-access-and-paths.md`](content-access-and-paths.md)                           | 项目/媒体 locator、`.neko` 本机 binding、派生存储、窄内容读写与 Webview 投影                                                |
| [`client-targets.md`](client-targets.md)                                               | OpenNeko Desktop 的产品目标、职责边界和验证重点                                                                             |
| [`creative-resource-semantic-boundaries.md`](creative-resource-semantic-boundaries.md) | 资源、Project Entity、Character 与 World 的简化用户模型、唯一 owner、创建、关联、引用和页面边界                             |
| [`media-runtime.md`](media-runtime.md)                                                 | Node/FFmpeg、OpenNeko Range/PCM、原生媒体 consumer、编解码、10-bit/HDR hardware preparation 和损坏范围边界                  |
| [`headless-project-authoring.md`](headless-project-authoring.md)                       | `.nk*` 持久项目写入的无 UI authoring 边界、operation 分类、canonical 入口和客户端适配                                       |
| [`package-boundaries.md`](package-boundaries.md)                                       | owning package、UI 层、公共代码、Desktop OpenNeko resource capability、Node 媒体运行时约束和验证命令                        |
| [`package-taxonomy.md`](package-taxonomy.md)                                           | Workspace package 角色、拆包条件、领域家族命名、显式 exports 与产品状态语义                                                 |
| [`wire-contracts.md`](wire-contracts.md)                                               | Wire contract、package-owned contract、项目格式与序列化边界                                                                 |
| [`ui-theme-i18n-error-logging.md`](ui-theme-i18n-error-logging.md)                     | UI 公共层、主题 token、国际化、错误处理、日志和诊断边界                                                                     |
| [`unified-entity.md`](unified-entity.md)                                               | 最小 Project Entity、候选、representation binding、Character/World 关联边界和搜索投影                                       |

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

架构文档应说明当前决策、约束、风险和后果。文件存在即表示当前有效，不额外保存生命周期状态、
更新时间、过时代码样例、命令输出、迁移阶段、完成日志、旧方案名或只对单次实现有意义的状态。

当领域决策上升为全系统约束时，将稳定结论提升到本目录，并从对应 `docs/domains/<domain>/` 文档链接回来。
