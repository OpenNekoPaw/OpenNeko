# Proposal: 恢复 DSH 产物到 Workspace Board 的同步

## Why

Pi runtime 原子替换为 DSH 时删除了旧的 creator-visible turn delivery producer，但 Canvas Domain
的投影协调器、持久 ledger 和节点 mutation 仍然保留。当前 DSH 会话完成内容读取与分析后只保存
transcript/tool projection，不再向配置的 Workspace Board 提交产物，因此画布只显示用户显式加入的
源文件。

## What Changes

- 在 Agent Runtime application 边界增加 DSH terminal-turn artifact collector：只从完成的 DSH
  projection 中提取成功消费的稳定 `ContentLocator` 和最终 assistant Markdown。
- 在 Electron Main 重新组合 Canvas-owned `WorkspaceBoardDeliveryCoordinator`，以一次 turn-end 批次
  将 source/analysis 关系投影到精确 Workspace Board。
- 使用稳定 delivery identity、locator-backed resource identity 和 Markdown content identity 实现轮内、
  跨通知、跨重试与跨重启去重。
- Host 在新 delivery 首次入账前读取 source fingerprint；同一 locator 内容变化时只刷新节点 provenance
  和现有预览内容，不改变资源 identity 或用户布局。
- 保持现有 Agent Webview 与 Canvas UI 不变；不恢复 Pi runtime、旧 Tool contract 或 renderer 文件写入。

## Impact

- **Owning responsibilities:** Agent Runtime 拥有 DSH terminal artifact collection；Canvas Domain 继续拥有
  deduplicated Board projection 与 ledger；Desktop Main 只拥有 Workspace 授权、SQLite concrete store、
  Canvas mutation coordination 和 wiring。
- **Affected packages:** `packages/agent/runtime`, `packages/canvas/domain`, `packages/canvas/node`,
  `packages/canvas/webview`, `apps/neko-desktop`, `scripts/agent-eval`。
- **User data:** 不迁移、不覆盖现有 `.nkc` 内容。新 delivery 只追加或复用普通内容节点；ledger 继续使用
  user-level LocalMetadata SQLite，Canvas 文档继续是节点和布局 authority。
