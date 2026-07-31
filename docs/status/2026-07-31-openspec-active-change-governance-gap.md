# OpenSpec 活动区治理缺口

- 日期：2026-07-31
- 范围：`openspec/changes/` 一级活动 change 与 `archive/`
- 性质：当前治理快照，不作为长期架构事实或批量归档授权
- 采集方式：按 change 目录、`tasks.md` 是否存在以及 checkbox 完成状态统计

## 结果

| 分类                 | 数量 | 判定                                                   |
| -------------------- | ---: | ------------------------------------------------------ |
| 活动 change 目录     |   95 | 不含 `archive/`，包含本次文档同步 change               |
| 全部 checkbox 已完成 |   65 | 需要逐项确认实现、验证、稳定文档和归档条件             |
| 仍有未完成 checkbox  |   23 | 保持活动，但必须检查是否仍符合 Desktop-only 当前架构   |
| 缺少 `tasks.md`      |    7 | 需要判断是旧格式、未完成提案、重复变更还是应删除的残留 |
| 已归档 change        |    6 | 位于 `openspec/changes/archive/`                       |

活动区仍包含 VS Code、TUI、Engine 和已退休包路径的历史设计与验证文字。历史证据本身可以
保留，但活动 change 不得继续作为当前实现入口，也不得让 removed-host path 重新返回成功。

## 处置边界

本快照不授权机械移动 65 个已勾选 change。后续治理应按 change 逐项执行：

1. 核对 proposal、design、spec、tasks 与真实代码和验证证据是否一致；
2. 确认稳定结论已经提升到 `docs/architecture/`、`docs/domains/` 或当前 spec；
3. 将已完成且无后续实施约束的 change 归档；
4. 对仍引用退休宿主或 Engine 的未完成 change，选择更新、合并、supersede 或删除；
5. 为缺少 `tasks.md` 的目录补齐合法 artifact，或明确其不再是活动 change；
6. 归档后运行严格 OpenSpec、文档链接、legacy debt 和 unused 检查。

需要推进本治理时应创建独立 OpenSpec change，并记录每个目录的 disposition；不得以本状态
快照代替任务清单。
