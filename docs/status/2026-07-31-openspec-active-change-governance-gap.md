# OpenSpec 活动区治理缺口

- 日期：2026-07-31
- 范围：`openspec/changes/` 一级活动 change 与 `archive/`
- 性质：带来源的治理快照，不作为长期架构事实或批量归档授权
- 清理前 source revision：`7679faa1afd20307580c905a779424ed35e4503a`
- 清理前采集时间：`2026-07-31T16:18:23+08:00`
- 清理后采集时间：`2026-07-31T16:26:02+08:00`
- 清理后 source revision：本文件所在提交；逐项目录与 successor 证据见
  [`openspec-active-area-governance`](../../openspec/specs/openspec-active-area-governance/spec.md)

计数按一级 change 目录执行：`tasks.md` 无未勾选项记为 complete，仍有未勾选项记为
incomplete，递归不存在任何文件的目录记为 artifact-free residue。工作区在采集期间包含
另行开发中的 Desktop、Agent、Assets 和 media 改动；本批次明确排除这些 change，不以本快照
处置其任务。

## 结果

| 分类                         | 清理前 | 清理后 | 处置                                              |
| ---------------------------- | -----: | -----: | ------------------------------------------------- |
| 活动 change 目录             |     95 |     85 | 删除 7 个无 artifact 残留，归档 4 个已核验 change |
| 全部 checkbox 已完成         |     66 |     65 | 1 个完成 change 归档；治理 change 完成后归档      |
| 仍有未完成 checkbox          |     22 |     20 | 2 个旧 change 由 successor 明确关闭并归档         |
| 缺少 `tasks.md` 且无任何文件 |      7 |      0 | 精确验证无文件和 tracked entry 后删除             |
| 已归档 change                |      6 |     10 | 本批次新增 4 个日期前缀 archive                   |

本批次同步并归档：

- `synchronize-desktop-only-documentation`：
  `repository-documentation-consistency` 已进入 canonical specs。
- `replace-cut-engine-with-node-ffmpeg-runtime`：
  `desktop-cut-node-media-runtime` 已进入 canonical specs；Engine 删除 gate 由 successor
  完成。
- `clean-openspec-active-area`：
  `openspec-active-area-governance` 在本批次验证完成后进入 canonical specs。

`align-pruned-workspace-build` 仅作为历史 artifacts 归档，没有把已退休 Rust Engine、VS Code
和 Cargo gate 同步为当前 requirements。

## 仍需治理

以下情况继续保持 active，不能用 checkbox 数量机械归档：

1. Engine 退役提案已在 2026-08-01 Electron-only 清理中删除；后续只以稳定架构和禁回流门禁为准；
2. `plan-neko-desktop-phase-1-delivery` 是仍含真实任务的 program change，应先把工作转移到
   focused changes；
3. `redefine-openneko-lightweight-editing` 仍混有未完成 Cut 任务，需要 Desktop Cut successor
   明确接管；
4. provider 成本、打包 Electron、GitHub branch protection 等外部证据 gate 必须保持未完成，
   不能静默勾选；
5. 其余 complete changes 仍需逐项比较 delta spec、canonical spec、实现、文档链接和 successor
   ownership。

## 后续处置规则

每个 change 归档前必须选择唯一 disposition：

1. **Active**：真实实现、验收、迁移或外部证据仍未完成；
2. **Archive with spec sync**：实现完成且 delta requirements 仍是当前事实；
3. **Archive without spec sync**：历史或 superseded artifacts，不得提升为当前 requirements；
4. **Delete empty residue**：递归无文件、无 tracked entry、无可恢复 artifact。

归档后必须运行严格 OpenSpec、Markdown 本地链接、legacy debt、unused 和
`git diff --check`。门禁若被本批次外的 dirty worktree 阻塞，必须记录精确来源，不得修改或
吞并无关开发改动。
