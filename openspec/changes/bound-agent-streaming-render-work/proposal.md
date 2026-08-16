## Why

Agent 响应流式渲染时，Pi provider 的每个 `assistant.text.delta` / `assistant.thinking.delta`
都会穿过 `PiTimelineProjector` → `ConversationProjectionStore.apply` → attachment server 的独立
`projectionPatch` IPC frame，最终在 Agent Webview renderer 上同步驱动一次完整投影与 React 渲染。Renderer
侧每个 token frame 都会：(1) 在 `applyConversationProjectionPatch` 中 `structuredClone` 并递归冻结
整个 conversation projection；(2) 重投影整个 message list（为每条消息重新派生 tool call 与估算高度）；(3)
重渲染整棵 `ConversationTabRuntimeView → ChatWorkspace → MessageList` 子树；(4) 触发一次滚动 rAF 与
virtualizer 重测。Markdown 解析虽然已经按 32ms 节流，但 projection 克隆/冻结、message-list 重投影和
React reconciliation 没有上界。快速 provider 在一个帧内投递多个 delta 时，这些同步 O(transcript) 长任务
连续执行，占满 renderer 主线程，饿死输入/定时器/rAF，使 Canvas、项目浏览器等无关 shell surface 变得卡顿
甚至无法交互。这是主线程饥饿，不是全局 loading/disabled/overlay 阻塞。

## What Changes

- `ConversationProjectionReplica` 增加一个可选的有界 presentation scheduler：每次 patch 仍然同步、完整地
  提交到 authoritative snapshot（保持 sequence/identity 校验与去重语义，不丢数据），但 listener 通知
  （也就是 React 重渲染 + message-list 重投影 + virtualizer/scroll）只在流式文本 append 期间按既有 32ms
  间隔合并，completion/非 append 补丁与 snapshot 立即 flush。
- `TabRenderRuntime` 拥有单一 32ms presentation 批次，按“提交 Markdown 快照 → 发布 Projection →
  发布 Markdown”顺序刷新同一次流式 append，防止两个 external store 暴露不同长度的可见内容。
- `applyConversationProjectionPatch` 只克隆被 patch 命中的 turn，未命中的已冻结 turn 按引用共享，消除
  每 token 对整个 transcript 的 `structuredClone` + 全量冻结。
- 保留 authoritative 顺序语义：replica 仍拒绝乱序/stale publication，`projectionAttachmentClient` 的
  sequence gap / owner mismatch / fatal 行为不变。

## Capabilities

### New Capabilities

- `agent-streaming-render-bounding`: 定义 Agent Webview 流式渲染期间 UI 投影与渲染工作量的有界性、
  权威投影完整性、以及无关 shell/Canvas surface 交互不被全局阻塞的要求。

### Modified Capabilities

无。

## Impact

- `packages/agent/contracts` 的 `conversation-projection.ts`：消除 per-token 全 transcript 克隆，仅克隆
  目标 turn；共享已冻结 sibling 保持完整不可变语义。
- `packages/agent/webview` 的 `conversation-projection-replica.ts` 与 `tab-render-runtime.ts`：新增有界
  presentation scheduler，并把 replica 接到既有 32ms 节奏。所有权不变：replica 仍由
  `TabRenderRuntime` 拥有，Markdown 会话仍由 `AgentMarkdownSessionRegistry` 拥有，Desktop 仍是薄
  组合根。
- 不改变 wire contract、不新增内部版本、不引入 renderer 持久事实、不增加第二份 transcript 或全局锁。
