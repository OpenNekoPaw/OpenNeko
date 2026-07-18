# 状态快照索引

本目录用于带日期的 gap、迁移进度、健康度和审计快照。状态文档记录某个时间点的证据，不是长期架构事实，也不承担任务管理。

文件名应包含日期和主题，例如 `2026-07-17-package-health.md`。每份快照应记录范围、证据来源、已知限制和采集日期。

- 需要设计或实施的行动项转入 [`../../openspec/changes/`](../../openspec/changes/)；
- 轻量排队事项转入根目录 TODO；
- 长期方向转入根目录 Roadmap；
- 稳定系统约束提升到 [`../architecture/`](../architecture/)。

不要创建 `current.md`、`latest.md`、`todo.md` 或 `plan.md`，以免历史快照被误认为当前事实。

## 快照

- [`2026-07-18-text-entity-extraction-gap.md`](2026-07-18-text-entity-extraction-gap.md)：统一实体文本抽取、动态工作区/素材库发现、SQLite 候选边界与第一阶段 Gap。
