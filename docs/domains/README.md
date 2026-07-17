# 领域文档索引

本目录用于单个保留领域的能力模型、领域数据流和领域内部架构。当前稳定的跨领域约束仍集中在 [`../architecture/README.md`](../architecture/README.md)；领域文档应在形成独立、稳定的领域事实后再建立子目录。

当前保留产品领域包括 Agent、Assets/Entity、Canvas、Cut、Preview、Tools 和 Media Engine。新增领域目录时使用 `docs/domains/<domain>/`，并优先提供：

- `README.md`：范围、参与包、横切能力和阅读路径；
- `architecture.md`：领域 owner、contract、依赖、生命周期和错误边界；
- 按需增加 `capability-map.md`、`data-flow.md` 或 `integration.md`。

尚在设计或实施中的内容放入 [`../../openspec/changes/`](../../openspec/changes/)，不要把任务进度写成稳定领域事实。已移除产品的旧设计只可作为明确标注的历史材料保留。
