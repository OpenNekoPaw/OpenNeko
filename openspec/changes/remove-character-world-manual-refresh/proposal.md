## Why

Character 与 World 管理目录已经在进入场景、查询和排序变化时从 package-owned runtime 重新读取；集合头部的手动刷新按钮没有独立用户价值，反而与错误态的明确重试动作重复，并增加窄布局中的低频控件。

## What Changes

- **BREAKING** 从 Character 与 World 集合头部移除手动刷新按钮及其可访问名称。
- 保留搜索、排序触发的 canonical reload，以及加载失败后的显式重试动作。
- 更新 Character/World Webview 测试和 Desktop functional/style assertions，证明删除的是普通态手动刷新入口，不是 runtime reload 或错误恢复能力。

## Capabilities

### Modified Capabilities

- `character-world-management-hierarchy`: 集合头部只保留紧凑搜索与排序；手动刷新不再是普通态管理操作，错误态重试继续可达。

## Impact

- Owning responsibility：`@neko/chara-webview` 与 `@neko/world-webview` 继续拥有各自 browser-only 管理目录的控件、查询和错误恢复 presentation；领域 catalog、导入、选择和 durable records 不变。
- Package roles：修改 `packages/chara-webview`、`packages/world-webview` 及 Desktop 组合层的展示/功能断言；不改变 Main、preload、IPC 或领域 contract。
- Replaced path：删除普通态手动 `reload` 按钮路径，不保留隐藏控件、feature flag 或兼容 alias；初始加载、搜索/排序 reload 和错误态重试仍使用同一 package-owned runtime。
- User data：不读取、迁移、覆盖或删除 Character、World、版本、运行记录或导入包。
