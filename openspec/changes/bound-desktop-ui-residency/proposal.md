## Why

Desktop 当前把可恢复的业务 identity 实现为所有 Workbench、Agent、管理页面和子 Surface 的永久 React 驻留，同时让 Host 持久化 renderer lifecycle 策略。打开过的 Workspace、Conversation 和页面因此持续累积 UI、subscription 与 runtime，普通导航也被提升成需要持久 session identity 的业务实例。

本地优先只要求 durable 数据与轻量展示状态可恢复，不要求隐藏 React tree 常驻。产品需要分离用户记录、当前可见 UI、后台任务和可回收 runtime，并为真实资源消耗设置简单、明确的上限。

## What Changes

- **BREAKING**：删除 Host contract 中的 `DesktopSurfaceLifecyclePolicy`、`DesktopWorkbenchViewLifecyclePolicy` 及其 `hot-retained | suspendable | ephemeral` renderer lifecycle 值和 resolver，不再由 Host contract 决定 React 挂载策略。
- **BREAKING**：取消“每个打开过的 Workbench、Agent draft/session、管理页面、资源页面和 Canvas inspector 都保持独立常驻 Root”的约束；不可见且空闲的 UI 默认卸载。
- 一个 Window 只保留一个窗口级 Shell、一个当前场景和一个当前 Workbench composition；每个可见 slot 只挂载当前 Root，只有用户显式分屏时才允许 `Secondary Main`。同一当前 Workspace 所需的 Agent Interaction、Main editor、Resources 或 Timeline 不构成历史驻留实例。
- Entry/Create 是新任务入口而不是长期 Workbench owner。每个 Window 至多保留一个轻量未发送 draft snapshot，不为每个 draft 保留 Agent Root。
- Assets、Extensions、Projects 和 Settings 是单例管理场景，不进入持久 open Workbench catalog；离开时卸载 UI，领域事实和必要的 filter/selection snapshot 仍由 owner 保存。
- Workspace、Conversation、Room、Project、Asset 和文档记录不设用户可见总数上限；通过 metadata projection、分页、搜索、最近项和归档管理，不以删除历史换取运行资源。
- Agent transcript、task、approval 和 turn runtime 与 React Root 解耦。运行中、排队中或等待审批的会话可在后台继续，inactive UI 不因此常驻。
- Agent 执行采用产品级有界并发：每个 Conversation 同时最多一个 turn，Phase 1 每个应用同时最多两个 provider turn，超出请求进入 conversation-owned queue。
- Workspace runtime 只为当前可见 Workspace 或拥有受保护后台任务的 Workspace 保留；Conversation runtime 只为当前可见、运行中、排队中或等待审批的 Conversation 保留。其余 runtime 释放后从本地 authority 恢复。
- package owner 只保存恢复所需的轻量 View snapshot，例如布局、viewport、selection、scroll、playhead 和 composer draft；不得用隐藏 DOM 代替领域持久化，也不新增通用跨领域 cache manager 或 LRU 框架。
- Scene transition 只提交当前 route/identity 和必要布局，不复制完整 runtime/UI 状态；Main 广播 canonical projection 后 Renderer 不再无条件再次读取完整 snapshot。
- 失效的 durable Project、Conversation、Room 或文档记录继续局部可见且不可操作；UI/runtime 回收不得删除、转换、隐藏或自动修复用户记录。

## Capabilities

### New Capabilities

- `desktop-ui-residency-bounds`: 定义 Desktop 业务记录、当前可见 UI、后台 task runtime、轻量 View snapshot、并发预算和释放/恢复边界。

### Modified Capabilities

<!-- None. The conflicting residency clauses belong to the still-active
`compose-desktop-workbench-scenes` change and are reconciled in that change before either change is
archived. -->

## Impact

- `@neko/host` 继续拥有 Window/Scene/Workspace/View identity、当前 route、布局与 typed transition；删除 renderer residency policy 和由管理导航产生的 durable Workbench/session catalog 状态。
- `@neko/agent-runtime` 拥有 Conversation/turn/queue/approval、后台执行、workspace/conversation runtime attach/detach 与应用级并发预算；持久 conversation catalog 不受 runtime 回收影响。
- Agent、Assets、Canvas、Cut、Preview、Chara 等 owning package 保存各自 durable facts 与最小 View snapshot，不共享通用 UI cache owner。
- `@neko/ui` 只提供当前/分屏 Surface composition primitive 和局部展示状态，不决定业务 runtime 生命周期。
- `apps/neko-desktop` renderer 只挂载当前和显式分屏 package Roots；Electron Main 只组合 package lifecycle ports、sender-bound IPC 与资源释放，不拥有领域恢复规则。
- Producer 是 Host/Agent/各领域 package public application service，consumer 是 Desktop Main adapter 与 renderer package Root。唯一 canonical path 是 durable authority -> package runtime attach -> current projection -> visible Root；被替代路径是 persisted lifecycle -> retained deck -> all open Roots。
- 本变更不增加云同步、内部 schema version、migration、legacy reader、fallback 或双路径。现有 Project、Conversation、Room、Asset 和文档事实不删除；被拒绝的 UI-only Shell 记录按最小 authority 产生明确 diagnostic，由用户显式处理。
