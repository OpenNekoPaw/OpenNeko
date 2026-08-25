# 领域文档索引

本目录用于单个保留领域的能力模型、领域数据流和领域内部架构。当前稳定的跨领域约束仍集中在 [`../architecture/README.md`](../architecture/README.md)；领域文档应在形成独立、稳定的领域事实后再建立子目录。

当前 Desktop 已组合 Agent、Generation、Assets/Entity、Canvas、Cut、Preview 和 Media
Runtime。Chara、Search、Quality 与媒体比较 Tools 仍保留领域 package，但尚未全部形成
Desktop 产品路径；本索引中的“保留”不等于“已经接入”。Assets 的产品入口是单一 Media
Library，Creative Entity 通过稳定引用与其连接。Generation 的边界由 owning package 的公共
contract 约束；Chara、World 与 Project 的稳定边界见下方索引。新增领域目录时使用
`docs/domains/<domain>/`，并优先提供：

- `README.md`：范围、参与包、横切能力和阅读路径；
- `architecture.md`：领域 owner、contract、依赖、生命周期和错误边界；
- 按需增加 `capability-map.md`、`data-flow.md` 或 `integration.md`。

尚在设计或实施中的内容放入 [`../../openspec/changes/`](../../openspec/changes/)，不要把任务进度或已退出产品拓扑的设计写成稳定领域事实。

当前已形成独立边界的领域入口：

- [`automation/README.md`](automation/README.md)：Browser/Computer automation 的 provider、session、target、授权与 evidence 边界；
- [`chara/README.md`](chara/README.md)：Character 背景故事、原生背景设定、个人故事线、记忆、Dialogue/Room 与表现边界。
- [`world/README.md`](world/README.md)：World 工作区对象、全局版本、运行/存档和单版本 ZIP 边界。
- [`project/README.md`](project/README.md)：Project identity、独立 association facts、派生 Content/dependency projection，以及 sync/package 边界。
