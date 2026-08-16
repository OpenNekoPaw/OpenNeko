# Implementation Evidence

日期：2026-08-17

## Ownership Result

Pi 是唯一 Agent loop、Session transcript/context、Skill discovery/format/read、Tool scheduling 和主模型 execution path。OpenNeko 继续拥有 Skill source/trust/enablement/fingerprint、turn snapshot、Conversation/queue/permission、Capability registry、领域 Job、Desktop IPC 和 Timeline/Webview projection；原有产品生命周期没有整体废弃。

本变更删除的是无 producer/consumer 的旧 Skill lifecycle 与 ToolSet 平行协议，不是 Conversation、Turn、Job 或 domain capability lifecycle。

## Migration Inventory

| 分类             | Owner                      | 删除/保留结果                                                                                    | Producer → consumer / 替代路径                                                                   | 冲突与验证                                                                   |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| delete           | Agent Prompt               | 删除 `GetContext`、`ActivateSkill`、`DeactivateSkill`、slot/active-record 与 active-persona 文案 | system Prompt → Pi Agent；替代为 catalog + `$skill` + `read_skill`                               | Prompt poison test；生产精确/语义 scan 零命中                                |
| delete           | Agent contracts            | 删除 activation DTO、progress message/builder/Host union                                         | 无生产 producer → Webview dead consumer；不设 compatibility handler                              | contracts absence test、typecheck、protocol tests                            |
| delete           | Desktop adapter            | 删除 `agentCapabilityActivationProgress` allowlist                                               | 无 Main sender → allowlist                                                                       | Desktop typecheck；旧 message scan 零命中                                    |
| delete           | Agent Webview              | 删除 handler/presenter/map/session props/message-list props/CSS/tests                            | dead Host message → dead UI state                                                                | Webview 107 files/822 tests；focused 116 tests；scan 零命中                  |
| delete           | Tool metadata              | 删除 ToolSet/group/injection/category registry/loading tier                                      | 无组合根 consumer；替代为 `CapabilityRegistryRuntime` → `ToolRegistry` → immutable turn snapshot | runtime public-surface poison、typecheck、106 files/1004 tests               |
| delete           | Perception metadata        | 删除只被 barrel/test 引用的 `perceptionToolGroup`                                                | 无 registry consumer；保留真实 `createPerceptionTools`/provider                                  | runtime typecheck/full tests                                                 |
| delete           | Chara Prompt/policy        | 删除不存在 Tool 名和 activation 文案                                                             | Character read-only policy 仍阻止真实副作用 Tool/显式不允许的 Skill input                        | Chara 44 files/241 tests；focused 7 tests                                    |
| delete           | Webview i18n/test fixtures | 删除 slot/progress/clear/active Skill 与 `skillInjection` 假字段                                 | 无组件/handler consumer                                                                          | Webview typecheck/full tests；i18n scan                                      |
| update           | Agent Evaluation           | `GetContext` 改为 `Read`/`ListDirectory`，更新 hard-gate facts                                   | 完整 Desktop driver → current Tool facts                                                         | key-free 45 files/310 tests；27 suites/80 cases dry-run                      |
| preserve         | Pi SkillHost               | roots/source/trust/enablement/fingerprint、opaque locator、`read_skill` receipt                  | `agent-app-host` → SkillHost snapshot → Pi conversation runtime                                  | SkillHost/conversation tests；`read_skill` producer/consumer scan            |
| preserve         | exact Skill identity       | `activationId`/`skillActivationId` 与 `skill.activated` receipt                                  | catalog snapshot → exact `$skill` input → Pi receipt/Evaluation facts                            | 这是不可变选择 identity，不是 slot/store/progress；stale identity tests 保留 |
| preserve         | Tool runtime               | `ToolRegistry`                                                                                   | capability/core/MCP producer → Pi Tool bridge                                                    | runtime public-surface positive assertions、registry tests                   |
| preserve         | Capability runtime         | `CapabilityRegistryRuntime`                                                                      | provider/manifests → ToolRegistry/prompt fragments                                               | 只删除 optional category bridge；capability tests                            |
| preserve         | real capability lifecycle  | `invokeAgentCapabilityLifecycle` / `agentCapabilityLifecycleResult`                              | Webview Canvas action → Host → result handler                                                    | contracts preserve assertion、protocol/command handler tests                 |
| preserve         | product lifecycle          | Conversation/Turn/queue/permission/domain Job/Timeline                                           | Desktop input → exact owner → Pi/Job → projection                                                | 相关文件未由本 change 修改；package full tests                               |
| preserve         | presentation/local names   | `ToolGroupContentBlockProjection`、`ContentReadToolSet`                                          | Timeline grouping / local static union                                                           | 无 activation/injection semantics；typecheck/full tests                      |
| rename-collapse  | 用户/模型术语              | activation/slot/record/clear → select/catalog/read/receipt                                       | Prompt、Settings、Help、Chara                                                                    | 中英文语义 scan；Prettier/typecheck/tests                                    |
| deferred-overlap | Agent launch/message queue | 用户当前 `canvasTurnTarget`/queue 修改                                                           | 独立用户 worktree change                                                                         | 本 change 未编辑四个用户文件；不把相邻 runtime cleanup 混入本 change         |

## Evaluation Evidence

### Scope

- Change: Prompt/Skill/Tool routing 与 Webview projection cleanup。
- Decision: update `agent-runtime.stream-delivery` 与 `skill.media-production` cases；reuse `agent-runtime.skill-runtime` 的 exact Skill receipt coverage。
- Canonical path: Desktop input → immutable catalog/tool snapshot → Pi `read_skill`/Tool → Timeline facts。
- Forbidden path: `GetContext`/activation Tool、ToolSet/category bridge、activation-progress Host message/UI。

### Key-free

- `pnpm test:agent:eval`: 45 files、310 tests passed。
- all-suite dry-run: 27 suites、80 cases，`ok: true`。
- 这只证明 Evaluation schema、fixtures、runner、hard gates 与 suite discovery，不是模型行为验收。

### Real Agent

- Result: `infrastructure-blocked` before launch。
- Blocker: 当前任务没有提供显式 provider/model identity 与 cost authorization；按 Evaluation policy 不得仅因本机可能存在 `~/.neko/config.toml` 就调用真实 API，也不得读取 secret、推断 provider 或用 mock/dry-run 替代。
- Unverified: 真实模型在 Prompt 变化后对显式 `$skill`、自然语言 Skill 匹配、长素材请求与 Tool ordering 的稳定行为；visible Desktop 的真实用户 controls 路径。

## UI Validation

- Scope: 删除不可达 activation-progress UI/CSS，更新 Help/Settings Skill 文案；适用。
- Authoritative runtime: activation-progress 没有生产 producer，不能通过真实用户路径进入；Help/Settings 视觉需要 Desktop runtime。
- Functional evidence: Webview full 107 files/822 tests、focused 116 tests、Desktop typecheck、真实 capability lifecycle handler tests passed。
- Visual result: `blocked`；本轮未启动真实 Desktop 可视运行，也没有可由用户触发的旧 activation-progress state 可截图。
- Residual risk: Help/Settings 的最终布局与中英文换行尚未做像素级检查；代码质量门禁不受此 advisory blocker 影响。

## Verification

- `openspec validate remove-legacy-agent-skill-activation-protocol --strict`
- `pnpm --filter @neko/agent-contracts typecheck`
- `pnpm --filter @neko/agent-runtime typecheck`
- `pnpm --filter @neko/agent-webview build`
- `pnpm --filter @neko/chara typecheck`
- `pnpm --filter @neko/app-desktop typecheck`
- `pnpm --filter @neko/agent-contracts test`: 43 files、259 tests passed。
- `pnpm --filter @neko/agent-runtime test`: 106 files、1004 tests passed。
- `pnpm --filter @neko/agent-webview test`: 107 files、822 tests passed。
- `pnpm --filter @neko/chara test`: 44 files、241 tests passed。
- `pnpm check:agent-boundaries`
- `pnpm check:legacy-debt`
- `pnpm check:unused`
- `pnpm test:agent:eval`
- `pnpm exec prettier --check ...`
- `git diff --check`

## Saved Analysis

当前 Prompt/Skill 清单、附件问题、五类能力覆盖、长素材 coverage 与文档保存缺口、开源参考已保存到
[`docs/research/agent-skill-prompt-migration-audit-2026-08-17.md`](../../../docs/research/agent-skill-prompt-migration-audit-2026-08-17.md)。长素材 orchestration 与通用文档自动保存具有不同 owner/contract，必须分别进入后续 OpenSpec，不能把未实现能力写成本 change 已完成。

## Residual Risk

- 真实 provider-backed Agent Evaluation 因缺少显式 provider/model/cost authorization 未执行。
- Help/Settings 的真实 Desktop 可视检查未执行。
- `activationId` 命名仍容易与已删除 lifecycle 混淆，但它当前有真实正确性消费者（同名 source/fingerprint 精确选择与 stale rejection）；本 change 保留其 canonical shape。若重命名，必须作为独立公共 contract 原子迁移，不能引入 alias/兼容读取。
- 用户当前四个未提交 Agent launch/message queue 文件未纳入本 change；相关相邻 cleanup 保持 `deferred-overlap`。

## Post-Commit Residual Review

- 复审发现稳定 Prompt/Skill validator ADR 仍要求已删除的 `GetContext`；现已改为当前 turn Tool snapshot、Skill catalog 与 Pi `read_skill` 规则。
- `activationId` 继续作为精确 Skill source/fingerprint 选择 identity 保留；parser、capability constraint 与 SkillHost 的用户可见 diagnostic 已改用 Skill selection/invocation 语义，不引入字段 alias 或兼容路径。
- `check:agent-boundaries` 现在扫描全部 `docs/architecture/**/*.md`，稳定规范重新出现 `GetContext`、`ActivateSkill` 或 `DeactivateSkill` 时 fail-visible；research、OpenSpec 与 poison tests 仍可作为明确退役证据保留字面量。
- Agent Evaluation disposition: `excluded`。本次不改变 production Prompt composition、Skill 路由、Tool snapshot 或模型行为；由 architecture poison、两条 parser diagnostic、stale Skill snapshot 与 capability constraint 的确定性测试覆盖。
- UI Validation: `not-applicable`。未修改组件、布局、交互或展示状态；只改变非法/过期 Skill identity 的失败 diagnostic 文案。
- 增量验证：Contracts focused 3 files/24 tests、Runtime focused 3 files/48 tests、contracts/runtime typecheck、`pnpm check:agent-boundaries`、`pnpm check:legacy-debt`、`pnpm check:unused`、OpenSpec strict、Prettier、生产残留 scan 与 `git diff --check` 均通过。
