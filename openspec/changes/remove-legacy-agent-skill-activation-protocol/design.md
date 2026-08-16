## Context

Pi 已经拥有唯一 Agent loop、Session JSONL transcript、Skill discovery/format/read 与 Tool 调度。OpenNeko 仍负责产品 identity、Skill source/trust/enablement/fingerprint、每 turn immutable snapshot、Conversation/queue/permission、Capability registry、领域 Job 与 Desktop projection。当前残留并非可工作的兼容层，而是没有生产 producer 的公共 contract/UI 链、没有组合根 consumer 的 ToolSet/category 链，以及仍会进入 Pi system prompt/评测 fixture 的旧协议文字。

本变更是跨 `agent-contracts`、`agent-runtime`、`agent-webview`、Desktop adapter、Chara 与外部 Agent Evaluation 的 L3 prelaunch cleanup。必须一次性删除 producer/consumer/export/test，并证明 canonical path 唯一；不得用兼容 handler、旧消息忽略或新旧并行路径收尾。

## Goals / Non-Goals

**Goals:**

- 删除旧 Skill activation progress、ToolSet/injection/category/tier 和不存在 meta-tool 的全部成功路径与公共导出。
- 保证 Pi SkillHost + `read_skill` + `$skill`/自然语言匹配是唯一 Skill 执行入口。
- 保证 `ToolRegistry`、`CapabilityRegistryRuntime`、真实 Agent capability lifecycle 和 Conversation/Turn/Job 生命周期不被误删。
- 用 absence/poison、唯一 producer-consumer、公共 surface、聚焦 tests 与 Agent Evaluation 建立可复核证据。

**Non-Goals:**

- 不替换 Pi、provider/model、Conversation persistence、permission/approval 或领域 Job。
- 不把 OpenNeko 的产品生命周期整体交给 Pi；Pi 不拥有 catalog、workspace trust、Capability authority 或 Desktop projection。
- 不清理与用户当前 `canvasTurnTarget` / message queue 修改重叠的 runtime surface。
- 不保留旧 persisted contract 的 migrator、dual-read、ignored message 或 fallback；当前链没有 authoritative 用户数据 producer。

## Decisions

### 1. Owner 边界保持 Pi execution 与 OpenNeko product lifecycle 分离

Pi 的 canonical public path 是 `packages/agent/runtime/src/pi/skill-host.ts` 与 `conversation-runtime.ts`：Skill catalog 常驻、完整正文只经 `read_skill` 加载，并把 receipt 写入 Pi transcript。OpenNeko 的 canonical composition 是 `agent-app-host.ts`、`agent-launch-service.ts`、`ToolRegistry` 与 `CapabilityRegistryRuntime`：冻结每 turn Skill/Tool/model/permission snapshot，并把领域 Tool 绑定到 exact owner。

替代方案是把 Conversation、Capability 或 permission 生命周期也视为 Pi 内部职责；拒绝该方案，因为 Pi 不拥有 OpenNeko workspace trust、领域 authority、Desktop IPC 或 durable product catalog。

### 2. 迁移 inventory 按删除、保留、命名收敛和重叠暂缓分类

| 分类             | Owner / package role                  | 当前 producer → consumer                                                                  | Canonical replacement / action                                           | 冲突风险                                     | 验证                                                       |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------- |
| delete           | Agent Prompt / runtime                | `builtin-prompts.ts` → Pi system prompt                                                   | Pi catalog + `read_skill` + 显式 `$skill`/自然语言选择                   | 模型调用不存在的 Tool，产生无效输出          | Prompt snapshot + poison absence                           |
| delete           | Agent contracts + Webview projection  | activation contract/builder/Host union → Desktop allowlist → handler/state/props          | Pi `read_skill` receipt 与普通 Timeline Tool projection                  | 无 producer 的 UI 状态被误认为真实 lifecycle | message union/export absence + Webview tests               |
| delete           | Agent contracts/runtime Tool metadata | ToolSet/injection/category/tier types → registry/resolver/perception group/public exports | immutable turn Tool snapshot from `ToolRegistry` and capability registry | 两套工具可见性/优先级语义冲突                | import/export absence + capability path tests              |
| delete           | Chara policy                          | static blocked names → embody session checks                                              | 当前真实 Tool policy/permission                                          | 阻止不存在工具掩盖真实边界                   | focused Chara tests                                        |
| delete           | Webview i18n                          | dead slot/help copy → help UI                                                             | `$skill-name` 精确选择与 Pi catalog 描述                                 | UI 宣称 slot/clear/expiry 等不存在功能       | locale exact-string tests/scan                             |
| update           | External Agent Evaluation             | JSON cases/hard gates → Desktop complete-session runner                                   | 真实 `Read`/`ListDirectory` 或当前 capability Tool                       | 假 Tool 让评测通过错误路径                   | key-free all-suite gate + focused real run when authorized |
| preserve         | Pi SkillHost                          | roots/source/trust/enablement/fingerprint → catalog/read receipt                          | 已是 canonical                                                           | 误删会失去 portable Skill 与信任边界         | existing SkillHost/conversation tests                      |
| preserve         | Agent runtime                         | `ToolRegistry` → frozen Pi Tool bridge                                                    | 已是 canonical                                                           | 误删会使 Tool 无法注册执行                   | registry/capability tests                                  |
| preserve         | Capability runtime                    | providers/manifests → ToolRegistry/prompt fragments                                       | 已是 canonical；仅删 optional category bridge                            | 与旧 Skill activation 名称近似               | capability registry tests                                  |
| preserve         | Agent capability lifecycle            | `invokeAgentCapabilityLifecycle` → Host → `agentCapabilityLifecycleResult` → Webview      | Canvas 等真实 capability command/result                                  | 误删真实生产 consumer                        | protocol/handler focused tests                             |
| preserve         | Conversation/Turn/domain Job          | Host input → exact identity queue/Pi session → Timeline/Job                               | OpenNeko product lifecycle                                               | 把 UI 或 Pi 当 owner 会导致任务取消/串会话   | existing session/queue tests；本变更不改用户文件           |
| preserve         | Webview Tool group projection         | Timeline Tool calls → `ToolGroupContentBlockProjection`                                   | 纯 UI 分组                                                               | 与旧 ToolSet 名称相似导致误删                | presenter/component tests                                  |
| preserve         | Content read union                    | content capability provider → `ContentReadToolSet`                                        | 局部 TypeScript union                                                    | 名称含 ToolSet 但无 lifecycle                | typecheck                                                  |
| rename-collapse  | Prompt/i18n terminology               | activation/slot/active-record copy → user/model                                           | Skill selection/read terminology                                         | 文案继续暗示状态机                           | residual exact scan                                        |
| deferred-overlap | Agent message runtime                 | 用户未提交 `canvasTurnTarget` / queue 修改                                                | 独立 change 评估相邻仅测试 runtime surface                               | 覆盖用户工作或扩大本提案边界                 | diff ownership guard + inventory evidence                  |

### 3. activation-progress 整条链原子删除

`packages/agent/contracts` 当前是该消息唯一声明/构造方，Webview 是唯一 consumer，Desktop 只有 allowlist；生产代码没有调用 builder 或发送该 message。因没有 authoritative 用户数据或 producer，删除 contract 文件、protocol member/builder/union、allowlist、handler/presenter/state/props/CSS 和 tests 是正确迁移；增加忽略旧消息的 handler 会构成被禁止的兼容路径。

### 4. Tool category 只删 lifecycle bridge，不删 Tool 的描述性 category 字段

旧 `tool-group.ts`、`tool-injection.ts`、`loading-tier.ts`、`tool-category.ts` registry contract、runtime category registry/tier resolver/perception group 是一套可激活 ToolSet 设计。`CapabilityRegistryRuntime` 的 `toolCategoryRegistry` 为 optional 且生产组合根只传 `toolRegistry`，所以删除 bridge 和导出。

`Tool.category` 作为 capability/tool metadata 仍可保留；它不控制 Pi tool snapshot。Webview 的 Tool call grouping 与 `ContentReadToolSet` 也保留，因为它们分别是 presentation projection 与局部静态 union。

### 5. Prompt 与 Evaluation 使用可执行事实，不模拟旧协议

系统 Prompt 只描述运行时真实提供的 Skill catalog、`read_skill` 与用户显式 `$skill`/自然语言匹配。测试必须断言旧 Tool/slot 名称不存在，并毒化旧符号，防止未来复制回流。

Evaluation case 中的 `GetContext` 改为当前完整 Desktop session 可执行的只读 Tool，fixture/hash/index 同步更新。key-free gate 只证明 schema/harness；若缺少明确 provider/model/cost authorization，真实 Agent 行为结果记录为 `infrastructure-blocked`，不得以 dry-run 代替。

## Risks / Trade-offs

- [公共导出删除导致隐藏 consumer 编译失败] → 先精确扫描 repo producer/consumer，再运行 contracts/runtime/webview/chara typecheck 与 focused tests；失败必须显式修复，不增加 compatibility export。
- [误删真实 capability lifecycle] → 对 `invokeAgentCapabilityLifecycle` / `agentCapabilityLifecycleResult` 做 preserve scan 和 focused protocol/handler 测试。
- [同名 ToolGroup 被过度清理] → 明确保留 Webview `ToolGroupContentBlockProjection` 与 `ContentReadToolSet`，只删除 activatable ToolSet owner。
- [Prompt 文案变化影响真实模型选择] → 更新 owning Evaluation case，并区分 key-free 与真实 Desktop provider-backed 证据。
- [用户未提交修改重叠] → 不编辑四个已修改文件，最终按 path 检查 diff；相邻清理记入 `deferred-overlap`。

## Migration Plan

1. 固化 inventory 与旧路径 poison/absence 要求。
2. 删除旧 contracts/runtime exports 和 optional category bridge，保持 canonical owners 编译通过。
3. 删除 activation-progress Desktop/Webview 整链与 i18n/Chara 残留。
4. 更新 Prompt 与 Agent Evaluation fixture/hard gates。
5. 运行 OpenSpec、focused tests/typechecks、全 suite key-free gate、legacy/unused 与 diff checks。
6. 将真实 Agent Evaluation 的运行结果或准确基础设施阻塞写入 `implementation-evidence.md`。

本地 prelaunch 变更不需要数据 rollback；代码 rollback 只能整体恢复本 change，不得只恢复旧 contract 或 handler 形成平行路径。

## Open Questions

- 无。若实施发现 message runtime 的旧 surface 与用户当前修改重叠，只记录为后续 change，不扩展本次边界。
