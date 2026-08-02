## Why

旧 Timeline/NKV/伪 Proto contract 已退出。此前提案假定仓库仍保留图片、音频、视频比较与
Media Info，但当前 package、Desktop producer 和 viewer 均已删除；继续保留该声明会制造不存在的
产品能力和待实现的平行 Tools 边界。

## What Changes

- 明确退役 Tools media comparison、Media Info 和相关 Desktop producer/viewer，不创建空 package。
- Cut 使用 OTIO projection，Canvas 使用 NKC contract，Agent 使用只读 owning projection。
- NKV/Timeline Diff/EngineDiff/伪 Proto generator 和 fallback 不能重新进入当前路径。
- 以 legacy-debt、workspace discovery 和文档一致性门禁证明退役路径不能成功。

## Capabilities

### Modified Capabilities

- `legacy-timeline-contract-retirement`: 当前代码禁止 NKV/old Timeline/伪 Proto/retired Tools
  comparison 成功路径。

## Impact

- workspace/package catalog、Desktop 路由、文档和 Cut/Canvas/Agent contracts。
- 用户文件不迁移、不改写、不删除。
