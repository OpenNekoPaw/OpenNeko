## Why

Pi 已经是 OpenNeko 唯一 Agent 执行路径，但同一个活跃 Turn 的显示状态仍由多套可写结构维护。VS Code Extension 的 Pi stream processor 同时更新 `ConversationProjectionStore`、累积可变 `Message` / `ContentBlock`，并发送 `streamText`、`streamThinking`、`toolCall`、`toolResult` 和 `streamComplete` 等旧 Webview 消息；Webview 同时消费 projection attachment 与 legacy handler。TUI 又通过独立 Pi adapter 和 Terminal Timeline projector 维护自己的文本、Tool 和终态状态。

这些平行 authority 会放大顺序竞态、重复渲染、Tool 状态漂移、取消后的迟到更新和重附着恢复问题。已接受的 `adr-agent-runtime-single-authority-and-simplification-boundary.md` 将 Timeline 单一权威列为 P0，并要求每个非平凡实施建立独立 OpenSpec。

## What Changes

- 在 `@neko/agent` 中建立一个 conversation/turn-scoped、host-neutral 的 Pi Timeline projector，将 `PiProductAgentEvent` 规范化为严格有序的 `ConversationProjectionUpdate`。
- 补全 Timeline identity contract：item、turn projection、update 和 patch 显式携带 `runId`，任何缺失、陈旧或不匹配的 conversation/turn/run/message identity 都 fail-visible。
- 将 `ConversationProjectionStore` 作为活跃 Agent Turn 唯一可变显示 authority；Extension、Webview 和 TUI 只消费同一 Timeline contract 的不可变 snapshot/patch 或派生 renderer view。
- 让 assistant text、thinking、Tool Call、Tool progress/result、confirmation、turn diagnostic、cancel 和 terminal completion 全部进入同一个 Timeline。
- 将 Pi Session transcript、活跃 Timeline projection 与 Host render representation 明确分离。活跃 Turn 不再增量写入第二套 `Message` / `ContentBlock`；终态历史只允许一次性从冻结的 terminal projection 或 Pi transcript 派生。
- 让 VS Code projection attachment 成为活跃对话内容的唯一 Webview transport。稳定 `ResourceRef` 保留在 canonical projection，Webview URI/display value 只在 attachment-specific Host presenter 中产生。
- 让 TUI 从同一个 host-neutral Timeline projector/store 派生 terminal rows、当前 assistant view 和 creator-visible Tool results，删除直接修改 conversation store 的平行 Pi stream adapter。
- 删除或 poison 活跃内容的 legacy `streamText`、`streamThinking`、`toolCall`、`toolResult`、`toolResultBackfill`、`toolConfirmation`、`streamComplete` 路由、handler、presenter 和 protocol surface。
- 将 projection gap、stale revision、identity mismatch、unknown Tool anchor、terminal 后 mutation 和 attachment failure 设为 fail-visible；恢复必须创建新 attachment 并安装新 snapshot，不能回退 legacy message。
- 更新 `agent-runtime.stream-delivery` suite 的证据 contract 和 cases，并增加 owning Extension Development Host functional scenario，证明真实 Webview 只消费 snapshot/patch。
- **BREAKING**：删除活跃 Turn 的 legacy stream message contract、并行 Webview handler 和 TUI direct-stream mutation path；不提供 compatibility flag、dual-write 或 fallback。

## Capabilities

### New Capabilities

- `agent-timeline-projection-authority`: 一个 Pi Turn 只通过 conversation-scoped Timeline projection 更新活跃显示状态，并由 Host-specific renderer 从该 projection 派生 UI。

### Modified Capabilities

- `pi-agent-runtime`: Pi product events 通过唯一 host-neutral Timeline projector 进入所有 Host，不再由 Extension/TUI 各自维护流式内容 authority。
- `pi-session-authority`: Pi Session 继续拥有 transcript；活跃 Timeline 只拥有显示 projection，终态历史投影不得成为第二套 transcript。

## Impact

- Contracts: `packages/neko-agent-types/src/agent-turn-timeline.ts`、`conversation-projection.ts`、Webview protocol 和 projection attachment frames。
- Runtime: `packages/neko-agent-runtime/src/pi`、`runtime/projection`、`runtime/stream`。
- VS Code Host: Pi stream processing、conversation bridge、projection attachment、resource display projection、debug acceptance 和 lifecycle cleanup。
- Webview: active conversation state、stream/tool handlers、Tab render runtime、Markdown session registry、presenters 和 tests。
- TUI: Pi event adapter、Timeline projector、conversation/agent stores、terminal artifact projection 和 debug facts。
- Evaluation: `agent-runtime.stream-delivery`、change-to-suite selector、key-free harness、real TUI cases and Extension Development Host functional evidence。
- This change does not redesign Prompt composition, the final renderer registry, Platform/config, generic Task/TaskManager ownership, or domain Job semantics.
