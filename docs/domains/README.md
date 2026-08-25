# 领域文档索引

本目录只保存核心产品领域的能力模型、领域数据流和领域内部架构。跨领域约束集中在
[`../architecture/README.md`](../architecture/README.md)；领域文档应在形成独立、稳定的产品事实后再建立
子目录。没有产品入口的 retained package、实验实现和当前接入状态以代码与机器台账为准，不建立领域文档。

新增领域目录时使用
`docs/domains/<domain>/`，并优先提供：

- `README.md`：范围、参与包、横切能力和阅读路径；
- `architecture.md`：领域 owner、contract、依赖、生命周期和错误边界；
- 按需增加 `capability-map.md`、`data-flow.md` 或 `integration.md`。

尚在设计的系统级或产品级功能放入 [`../../openspec/changes/`](../../openspec/changes/)；实现进度和产品
可达状态以代码、测试与机器台账为准。

当前已形成独立边界的领域入口：

- [`chara/README.md`](chara/README.md)：Character 背景故事、原生背景设定、个人故事线、记忆、Dialogue/Room 与表现边界。
- [`world/README.md`](world/README.md)：World 工作区对象、全局版本、运行/存档和单版本 ZIP 边界。
- [`project/README.md`](project/README.md)：Project identity、独立 association facts、派生 Content/dependency projection，以及 sync/package 边界。
