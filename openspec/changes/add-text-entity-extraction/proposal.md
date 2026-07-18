## Why

工作区文件可能由外部复制、Git 操作、同步工具或其他进程写入，素材库也可以直接指向本地目录，因此实体分析不能依赖显式导入命令或单一 VS Code 文件事件。当前候选还会直接写入项目级 `candidates.json`，容易制造大批量审阅队列，并把可重建分析结果误当成 Git 项目事实。

## What Changes

- 新增工作区与已配置素材库根目录的动态 source discovery：文件事件提供低延迟提示，启动、根目录变化和有界 reconciliation 保证最终完整性。
- 新增 host-neutral 文本实体分析服务，第一阶段处理 Markdown、纯文本、Fountain、JSON 和 YAML，从稳定 source range 生成文本片段与 entity mention。
- 将 source fingerprint、semantic evidence、实体出现点、候选聚类和匹配结果写入用户级 `~/.neko/neko.db` projection；confirmed entity 继续写入 Git 可审阅项目事实。
- 自动执行唯一精确链接、候选聚类、证据累计、降噪和建议排序；用户只处理高价值新实体、歧义、冲突和合并决策。
- 区分“发现文件”“建立语义 projection”“注册 Asset”和“确认 Entity”，发现外部文件不得静默修改素材库或实体项目事实。
- 为 VS Code 提供 LSP 风格的 diagnostics/navigation adapter，但不增加独立 LSP 进程；TUI、Agent 和其他 Host 复用同一 host-neutral service。
- **BREAKING**：停止自动分析与 Agent contribution 向 `neko/entities/candidates.json` 写入候选；旧自动写入路径在新 canonical path 接入后删除或 fail-visible。
- 第一阶段不包含 OCR、ASR、图片/音视频内容分析、embedding/TurboVec、复杂共指或基于向量最近邻的自动实体合并。

## Capabilities

### New Capabilities

- `dynamic-semantic-source-discovery`: 工作区与素材库根目录的事件感知、增量 reconciliation、source identity、freshness、删除和根目录变更语义。
- `text-entity-analysis`: 文本格式解析、mention 提取、确定性实体链接、候选聚类与自动分流、SQLite projection 和用户确认边界。

### Modified Capabilities

无。

## Impact

- 主要涉及 `@neko/content`、`@neko/entity`、`@neko/search`、`@neko/shared` local metadata、`neko-assets` Extension Host 和 `neko-agent` contribution automation。
- 需要扩展 `EntityProjectionRepository` / semantic projection contract，但不向 Webview 暴露 SQL、数据库路径或 Host 文件句柄。
- 需要统一或替换现有 Project Search、Media Library Search、Media LSP 和素材树中的重复 watcher/rebuild 触发逻辑；各消费者保留自己的 projection owner。
- 需要迁移或清理现有 `candidates.json` 自动候选，并保证 confirmed entity、binding、Asset library facts 和用户已确认决策不丢失。
- 验证覆盖 host-neutral 单元测试、SQLite repository contract、Extension watcher/reconciliation 集成路径、生产者/消费者构建与依赖边界检查。
