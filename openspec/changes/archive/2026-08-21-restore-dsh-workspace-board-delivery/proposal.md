# Proposal: 恢复 DSH 产物到 Workspace Board 的同步

## Why

Pi runtime 原子替换为 DSH 时删除了旧的 creator-visible turn delivery producer，但 Canvas Domain
的投影协调器、持久 ledger 和节点 mutation 仍然保留。当前 DSH 会话完成内容读取与分析后只保存
transcript/tool projection，不再向配置的 Workspace Board 提交产物，因此画布只显示用户显式加入的
源文件。

## What Changes

- 在 Agent Runtime application 边界增加 DSH artifact collector：每个受支持的内容 Tool 成功完成时立即
  投影已消费的稳定 `ContentLocator`；Workspace 模式成功 `turn/end` 时先把确定性的最终 assistant Markdown
  原子发布为 `neko/generated/file/` 下的 durable 文件，再把该文件的 `ContentLocator` 与来源关系投影到本轮
  明确选择的 Canvas。
- 终态 collector 必须从成功 Document Tool 的完成结果取得 canonical `ContentLocator`，并用
  Content-owned model-argument decoder 校验它与请求完全一致；Content image Tool 使用同一 decoder
  验证已成功消费的精确 locator。不得读取内部 ACP `input` envelope、复制 Tool shape 或把 raw path
  作为跨应用契约。
- 在 Electron Main 重新组合 Canvas-owned `WorkspaceBoardDeliveryCoordinator`，以 tool-completion source 批次
  和 turn-end analysis 批次将内容投影到精确 Workspace Board。
- 使用稳定 delivery identity、locator-backed resource identity 和 Markdown file content identity 实现轮内、
  跨通知、跨重试与跨重启去重。
- Host 在新 delivery 首次入账前读取 source fingerprint；同一 locator 内容变化时只刷新节点 provenance
  和现有预览内容，不改变资源 identity 或用户布局。
- Host fingerprint/preview adapter 必须覆盖同一 canonical `ContentLocator` union，包括 workspace file 与
  document-entry selector；不得为 Board 建立只支持普通文件的缩减 reader。
- 单条 completed content Tool 的参数或结果无法按 canonical contract 解码时，终态 collector 必须以
  tool-call diagnostic 局部拒绝该记录，不得阻断同轮其他有效 source 与最终分析。
- Document Tool 已明确声明 image-only entry 时，Board 直接投影其 embedded image locator，不再先写章节
  wrapper；后续 Content Image Tool 读取同一 locator 时复用已有节点。文本、mixed、文件根和不同 selector
  继续按完整 `ContentLocator` 独立定位。
- 本轮选择的 Workspace Board 或 exact Canvas 必须在 turn admission 时保存并绑定到真实 turn；terminal delivery
  不得读取当前 UI selection、active/recent Canvas 或固定回退 Workspace Board。
- Character、World 与普通非 Workspace Conversation 不自动发布分析文件或写 Canvas；后续仅能由明确的用户保存
  意图进入同一文件发布与 Canvas authoring 链路。
- 保持现有 Agent Webview 与 Canvas UI 不变；复用 Canvas 文件节点的授权文本读取与 Markdown 默认渲染，
  不恢复 Pi runtime、旧 Tool contract、renderer 文件写入或第二种 locator 协议。

## Impact

- **Owning responsibilities:** Agent Runtime 拥有 DSH Tool/terminal artifact collection、Workspace 自动发布策略、
  turn-scoped Canvas target 与 durable Markdown publication workflow；Content 拥有授权原子文件 IO；Canvas Domain
  继续拥有 locator-backed Markdown rendering、deduplicated projection 与 ledger；Desktop Main 只拥有 Workspace
  授权、SQLite concrete store、文件/Canvas concrete adapter 和 wiring。
- **Affected packages:** `packages/agent/runtime`, `packages/canvas/domain`, `packages/canvas/node`,
  `packages/canvas/webview`, `apps/neko-desktop`, `scripts/agent-eval`。
- **User data:** 不迁移、不覆盖现有 `.nkc` 内容。新 delivery 只追加或复用普通内容节点；ledger 继续使用
  user-level LocalMetadata SQLite，Canvas 文档继续是节点和布局 authority。
