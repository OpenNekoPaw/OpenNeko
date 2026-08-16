## Context

Agent 流式输出由 `packages/agent/runtime` 的 `PiTimelineProjector` 把 Pi `assistant.text.delta` /
`assistant.thinking.delta` 投影为 `ConversationProjectionUpdate`，`ConversationProjectionStore.apply`
把它变成 `ConversationProjectionPatch`，attachment server 再把每个 patch 作为独立 `projectionPatch`
frame 经 Desktop bridge/preload 送达 Agent Webview。Webview 里 `ConversationProjectionReplica` 对每个
patch 同步 `applyConversationProjectionPatch` 并同步通知 `ConversationTabRuntimeView` 的
`useSyncExternalStore`，触发整条 `ChatWorkspace → MessageList` 渲染链。

现状中已存在的设计意图是：Markdown 增量解析按 `AGENT_MARKDOWN_PRESENTATION_INTERVAL_MS = 32` 节流
（`AgentMarkdownSessionRegistry.appendEntry` + `scheduleAgentMarkdownStreamingUpdate`），virtualizer 也
用 `useFlushSync: false`。但 projection replica 的通知没有等价上界，导致每个 token 都同步做全量
transcript 克隆/冻结、全量 message-list 重投影和全树 React reconciliation。快速 provider 在一个帧内
产生多个 delta 时，这些同步长任务连续执行，主线程饥饿使 Canvas、项目浏览器等无关 surface 无法交互。

## Goals / Non-Goals

**Goals:**

- 权威投影在每次 patch 后立即完整且正确（sequence/identity/dedup 语义不变，最终内容无丢失）。
- UI 投影/渲染工作（replica 通知 → React 重渲染 → message-list 重投影 → virtualizer/scroll）在流式
  append 期间有界为每 32ms 一次，而不是每 token 一次。
- completion 或非 append 补丁（tool 结果、confirmation、replace/snapshot/complete）立即 flush，保证
  终态和审批路径不被延迟。
- 消除 `applyConversationProjectionPatch` 每 token 对整个 conversation 的 `structuredClone`，未命中
  turn 按引用共享且保持完全不可变。

**Non-Goals:**

- 不改变 wire contract、不新增内部版本或 dispatch 字段。
- 不引入第二份 transcript、renderer 持久事实、全局锁或重复状态 owner。
- 不把 Agent task/runtime 生命周期绑定到 UI 挂载，不改变 Desktop 薄组合根。
- 不节流到丢失最终数据：authoritative snapshot 每个 patch 同步提交，presentation 只合并通知节奏。

## Decisions

### 1. Replica 提交同步、通知合并

`ConversationProjectionReplica` 的 `commit(projection, coalesce)` 仍然同步替换 `this.snapshot`，这样
`preparePatch` 的 stale-publication 校验、`projectionAttachmentClient` 的 sequence/owner 校验和后续
patch 的基底都基于完整 authoritative snapshot。只有 listener 通知通过可选的
`scheduleStreamingPublication(cb) → cancel` 合并：当且仅当 patch 无 `completion` 且全部 operation 都是
`append`（流式文本/thinking 累积）时才合并；否则立即取消挂起 flush 并同步通知。

- `prepareSnapshot` 永远立即通知（每次 attach 仅一次）。
- completion patch 到达时立即 flush，保证终态与审批立即可见，不依赖 32ms 定时器。
- `dispose()` 取消挂起 flush，且不再通知正在被拆除的 subscriber（与
  `AgentMarkdownSessionRegistry.disposeAll` 一致）。

### 2. Tab 拥有跨 Projection/Markdown 的一致发布批次

`TabRenderRuntime` 拥有单一 32ms presentation scheduler，而不是为 replica 与 Markdown registry
分别创建独立 timer。一次批次分成三个有序阶段：

1. 执行挂起的 Markdown parser update，使 Markdown external-store snapshot 达到本批次目标 source；
2. 发布 Projection replica listener，使父级 message/content props 切换到同一 source；
3. 发布 Markdown listener，使 Markdown 子树读取已经一致的 props 与 snapshot。

顺序约束是跨 store 的 presentation invariant，不能依赖 timer 注册顺序或 React 自动 batching。对于
completion、Tool Call、confirmation、replace、snapshot 等立即发布路径，Markdown registry 在返回
publication 前同步 flush 当前 conversation 的挂起 parser update，随后仍由 attachment commit 按
Projection → Markdown publication 顺序发布，因此立即路径也不会暴露旧 Markdown snapshot。

### 3. 只克隆被命中的 turn

`applyConversationProjectionPatch` 不再 `snapshot.turns.map(cloneConversationTurnProjection)`。它先按
`turnId` 定位命中 turn，仅对命中 turn 的 items 做 `cloneAgentTurnProjectionItem`，未命中 turn 直接复用
已冻结的引用。`freezeProjectionSnapshot` 用模块私有 `WeakSet` 标记由 canonical deep-freeze 路径处理过的
对象；后续 patch 遇到共享 sibling 时直接跳过整个已验证子树，同时外部传入的浅冻结对象仍会被完整递归
处理。所有既有校验
（conversation/turn/run/message owner、completed-turn 拒绝、operation owner）保持不变。

## Risks / Trade-offs

- [通知延迟 32ms 影响终态] → completion / 非 append patch 立即 flush，不依赖定时器。
- [共享已冻结 sibling 导致可变性泄漏] → 上一 snapshot 由 `freezeProjectionSnapshot` 递归冻结，共享引用
  不可变；测试断言跨 patch 的 sibling turn 引用稳定且 `Object.isFrozen`。
- [两个 external store 在同一 append 暴露不同 source] → Tab 级三阶段批次先提交 Markdown snapshot，
  再发布 Projection 与 Markdown listener；fake-timer 回归测试模拟父级 content prop 和子级 Markdown
  subscription，禁止出现任一中间 mismatch。
- [dispose 后挂起 flush 触发更新] → `dispose()` 取消挂起 flush 并清空 listener。

## Migration Plan

1. 在 `conversation-projection-replica` 增加可选 scheduler，`TabRenderRuntime` 用单一 32ms 批次协调
   replica publication 与 Markdown update/publication。
2. 让 Markdown registry 的延迟 update 返回 publication，并在非流式立即路径同步 flush 当前 conversation
   的挂起 update。
3. 在 `applyConversationProjectionPatch` 只克隆命中 turn。
4. 运行 contracts / webview 聚焦测试与 typecheck，记录验证证据。

回滚为整体恢复旧行为；无持久 schema 或用户数据迁移。

## Open Questions

无。
