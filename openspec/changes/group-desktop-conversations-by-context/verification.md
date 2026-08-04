# Verification

## 结论

本变更按 L4 Desktop 核心创作工作流审查。实现保持三类事实分离：

- `conversationId` 只选择 AgentSession transcript；
- `assistant | workspace | character + characterRunId | room + roomRunId` 选择能力、记忆和 Scene owner；
- `groupedProjectId` 只控制 PrimarySidebar 导航位置，不授予 Workspace 权限。

PrimarySidebar 是唯一用户可见的会话切换入口。Project 标题走
`open-project-workspace -> exact Workspace grant -> owner-bound Draft`，已会话 Scene 会创建新 Draft，
同一 Project 的现有 Draft 才允许幂等复用；会话子项走
`restore-conversation(navigation) -> exact home owner -> lifecycle context -> complete Scene`。任何路径都不读取
active/first/recent Project 作为 owner fallback。

## Deterministic Verification

以下命令通过：

- `pnpm --filter @neko/agent-contracts test`: 42 files / 285 tests；覆盖四种 owner、未知 kind/version、重复会话和 identity mismatch。
- `pnpm --filter @neko/agent-runtime test`: 116 files / 1085 tests；覆盖 Pi catalog/context join、Assistant/Workspace owner 投影、旧 synthetic Project 路径移除和 Desktop terminal-idle identity fence。
- `pnpm --filter @neko/agent-webview test`: 90 files / 699 tests；覆盖 Desktop 组合下隐藏 package Tabs/History。
- `pnpm --filter @neko/host test`: 36 files / 323 tests；覆盖权威分组、确定性排序、精确 restore/delete、Character/Room unavailable 和 Project Draft 激活。
- `pnpm --filter @neko/app-desktop test`: 65 files / 348 tests；覆盖 Main delegation、renderer 分组、折叠/展开、首条消息原子 Scene 激活和 fixture-only automation v2 contract。
- `pnpm exec vitest run packages/host/src/desktop-shell-service.test.ts packages/host/src/desktop-shell-contract.test.ts packages/host/src/desktop-scene-contract.test.ts apps/neko-desktop/src/main/app-host.test.ts apps/neko-desktop/src/renderer/DesktopShell.test.tsx`: 5 files / 102 tests，最终修复后通过。
- Agent Contracts、Agent Runtime、Agent Webview 和 Desktop 受影响 typecheck 通过；Host 没有 package `typecheck` script，生产类型路径由 root build/package 覆盖。
- `pnpm build`、`pnpm test`、`pnpm check`、`pnpm check:quality`、`pnpm check:legacy-debt`、`pnpm check:application-boundaries` 通过。
- `pnpm check:unused`: Knip 无 issue，仅输出既存 configuration hints。
- `pnpm package:desktop`: 通过，验证 `darwin-arm64` 正式应用输出。
- `git diff --check` 和 `pnpm exec openspec validate group-desktop-conversations-by-context --strict`: 通过。

额外运行 `pnpm exec tsc -p packages/host/tsconfig.json --noEmit` 时命中一处未修改的 test-only 类型错误：
`desktop-shell-state.test.ts:566` 展开 `unknown` migration fixture。该包没有声明此 typecheck 入口；本变更的 Host
聚焦测试、root build、Desktop typecheck 和正式打包均通过，未把该非门禁命令描述为成功。

## Path Evidence

- Agent contract/parser 拒绝未知 projection version、owner kind、额外字段、不完整 CharacterRun/RoomRun 和重复 conversation identity。
- Pi catalog 从同一 SQLite snapshot LEFT JOIN canonical conversation context；context payload/version 不匹配直接失败。
- Host 从 Project catalog 和 Agent Home projection 生成唯一 grouped projection；Workspace 必须解析为一个 exact Project，renderer 不参与 join 或 owner 推断。
- restore/delete 同时比较 `conversationId + full owner`；Assistant lifecycle 不要求 Project，wrong owner 和 stale revision fail closed。
- Project 标题不选择历史会话；Host 单元回归证明 active Workspace session 会变为无 `conversationId` 的新 Draft，而同一 Workspace Draft 保持幂等。
- Character/Room codec 可读取完整 run identity，但当前 Desktop 在 lifecycle context 读取前返回
  `desktop-scene-owner-unavailable`，不会降级为 Assistant/Workspace。
- Desktop Agent header 在组合模式隐藏 Tabs、新建和 History；package 内部 runtime/session state 保留。

禁止路径证据包括：不再生成 Agent-side `content:<workspaceId>` navigation identity；不接受
active/first/recent Project；不从 renderer、Agent Tab、标题或 transcript 推断 owner；Character/Room 不返回占位成功；
首条消息不经过中间 Assistant Draft transition。

## Agent Evaluation

Disposition 为 `reuse + deterministic extension`：复用
`agent-runtime.workflow-controller/conversation-persistence-resume` 验证同一 conversation 的持久化恢复语义，
新增 Host/Desktop deterministic exact-owner 与 no-fallback 断言，并用完整 Electron 场景验证用户路径。

- `pnpm test:agent:eval`: 45 files / 288 tests，通过；这是 key-free harness 证据，不是 Agent 行为验收。
- `node scripts/agent-eval/all-suite-dry-run.mjs`: 22 suites / 53 cases，通过；这是 schema/selection 证据。
- provider-backed focused run `agent-runtime.workflow-controller/conversation-persistence-resume`
  通过，run id 为 `focused-1-msevlddz-r1`，provider/model 为
  `nekoapi-chat / gpt-5.6-luna`。7 个 hard gates 全部通过，报告摘要为
  `Observed 2 turn(s), 0 runtime error(s), fullyIdle=true.`。
- 两轮共用同一 conversationId，但 turnId/runId 均不同；snapshot 顺序为
  `user -> assistant -> user -> assistant`，两次回复分别为
  `This is the persistence checkpoint.` 和 `The resumed conversation can continue.`。
- canonical path 为 sender-bound Desktop controller -> Pi conversation runtime -> Pi Session transcript ->
  SQLite metadata -> conversation projection store；`forbiddenPathCount=0`，durable checkpoint 已观测，
  terminal disposal 完成，无 mock/provider/legacy fallback。
- usage 为 4004 input tokens、10 output tokens、报告 cost 0；唯一非阻塞 diagnostic 为
  `unsupported-thinking-budget`。本次运行以只读方式使用当前 `0644` 的
  `~/.neko/config.toml`，Evaluation 未要求 `0600`、未修改源文件权限，也未记录配置内容。
- 原始证据位于
  `reports/agent-eval/agent-runtime.workflow-controller/conversation-persistence-resume/focused-1-msevlddz-r1/result.json`、
  `evidence.json` 和
  `reports/agent-eval/agent-runtime.workflow-controller/conversation-persistence-resume/focused-1-msevlddz/aggregate.json`；
  Desktop 报告位于 `reports/agent-eval/focused-1-msevlddz-r1/desktop-functional.json`。

这个 case 验证了 Workspace-bound 完整 Desktop session 内的两轮真实 provider 对话、
snapshot 恢复、持久化事实和 terminal disposal。当前 `resume` step 读取同一 session owner 的
conversation snapshot，没有 dispose/recreate owner，因此这份证据不声明完整应用重启恢复。
Assistant Entry Draft 的自动模式选择仍由 deterministic 与 Electron UI 场景覆盖，本次
provider-backed case 不将其扩大为 Assistant/Character/Room 行为验收。

## Electron Evidence

所有场景使用隔离 synthetic fixture：

| Target      | Scenario                          | Result                                                                                       | Report                                                                                                                                                                |
| ----------- | --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| development | `desktop-workbench-scenes`        | passed，17 checkpoints                                                                       | `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T15-02-00.864Z-desktop-workbench-scenes-development/report.json`        |
| packaged    | `desktop-workbench-scenes`        | passed，17 checkpoints，0 console error/warning/exception/poison                             | `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T15-50-18.563Z-desktop-workbench-scenes-packaged/report.json`           |
| development | `desktop-conversation-navigation` | passed，6→5 collapse、expand、exact delete/restore                                           | `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T15-38-25.663Z-desktop-conversation-navigation-development/report.json` |
| packaged    | `desktop-conversation-navigation` | passed，6→5 collapse、expand、exact delete/restore；0 console error/warning/exception/poison | `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T15-50-40.024Z-desktop-conversation-navigation-packaged/report.json`    |

导航场景还断言删除非活动会话不会改变 active session，恢复原会话后 transcript 可见，且 Agent package
Tabs/History 均不存在。Workbench 场景覆盖 Entry Draft、Workspace Draft、Project exact restore、reload、
管理/预览组合以及 1440×960 和 1040×700 布局。

早期 packaged 报告
`2026-08-04T14-56-10.513Z-desktop-workbench-scenes-packaged/report.json` 失败于首条 Assistant 消息已写入
catalog、Scene 仍停留中间 Assistant Draft。根因是 first-submit 前额外 Scene transition 与异步 home projection
更新竞争；移除中间 transition 后，提交直接从 exact Entry Draft 原子附加 conversation。后续 development、
packaged Workbench 和专用导航场景均通过。

## User Data And Migration

- Pi transcript、branch、conversation/context rows 不做破坏性重写，conversation identity 保持不变。
- grouped navigation 是 Host 从 Project catalog + Agent Home 派生的可重建 projection，不成为持久权限或记忆事实。
- 支持的旧 Workspace context 只通过既有 exact Workspace migration authority 一次性提交；无法解析的 context、未知 schema/version/kind 直接失败，不迁移到默认 Assistant 或最近 Project。
- 回滚是预发布 source-level 回滚；派生 sidebar projection 可重建，但旧 binary 无法读取的新 contract version 应 fail visible。

## Quality Review And Residual Risk

`neko-quality-review` 最终没有 blocking finding。审查过程中发现并修复了“Project 标题在 active session
下保留旧会话或返回 `new-conversation-required`”的设计偏差，并补充 session→Draft 与 Draft 幂等回归。
pre-commit 审查还删除了 Host 切换到 Agent canonical parser 后遗留的本地 parser helpers。
Desktop 仍只拥有 Electron sender/window、typed bridge 和 React composition；owner、grouping、排序、CAS 和
lifecycle 规则位于 Agent/Host owning packages。

提交按职责拆分为：`1389367e`（Agent contracts/runtime/catalog）、`17a12467`（Host/Desktop/UI/scenario）
和第三批 OpenSpec/architecture/evidence 文档。

剩余风险：

- Character/Room 仅有严格导航 owner contract；CharacterRun/RoomRun runtime、Scene surfaces 和 restore/delete adapter 尚未组合，当前按设计 fail visible。
- provider-backed persistence-resume 已完成单次真实 API 验证，但单样本不支持稳定性或模型质量结论，
  也不覆盖 dispose/recreate owner 或完整应用重启恢复。
- 非 Workspace conversation 的显式“关联/移出 Project”交互不在本变更范围；contract 保留可选 group identity，但没有发明 drag/drop 或隐式关联。
