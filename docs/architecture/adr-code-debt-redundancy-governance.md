# ADR: 重复、冗余与兼容代码治理

状态：Accepted
日期：2026-06-18
范围：全仓库 TypeScript、React Webview、VSCode Extension、Rust Engine、WebGL/GPU 样板、共享契约与质量门禁。

本文记录 OpenNeko 对重复代码、冗余代码、兼容桥和 fallback 代码的治理决策。它补充 `adr-code-review-quality-gates.md`、`package-boundaries.md` 和 `openspec/project.md`，用于把静态扫描结果转成可执行的架构判断。

## 背景

仓库仍处于 prelaunch 阶段，可以对未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 和 nk\* 草稿格式做显式破坏性调整，以清理 legacy debt 并收敛到 canonical 架构。

但扫描词本身不能直接等同于问题：

- `fallback` 可能是运行时韧性、展示默认值、错误 UI 或旧路径兼容。
- `legacy` 可能是待迁移旧协议，也可能是明确保留的桥接边界。
- `unused export` 可能是死代码，也可能只是内部函数过度导出。
- 重复样板可能是无害领域差异，也可能说明缺少共享 helper、adapter factory 或公共 primitive。

因此治理目标不是消灭所有关键词，而是把它们分成可删除、可内化、可迁移、需保留和需台账跟踪几类。

## 决策

OpenNeko 对重复、冗余和兼容代码采用“先分类、再收敛、最后验证”的治理流程。

### 分类

| 类别 | 判定 | 默认行动 |
| ---- | ---- | -------- |
| 死代码 | 文件、函数或导出没有静态引用，且不是运行时入口、CLI、package export、测试 fixture 或动态加载目标 | 删除 |
| 过度导出 | 符号只在同文件或同模块内部使用，但作为 public export 暴露 | 移除 `export`，保留实现 |
| 重复实现 | 两个以上包或模块复制相同 adapter、provider、bridge、icon、shader/helper、错误处理或协议样板 | 提取到共享层、domain service、factory、hook、helper 或公共 icon |
| 当前兼容桥 | 保护有价值本地数据、外部信任边界、迁移入口或仍被 owner 注册路径需要的旧接口 | 保留，但必须有 owner、replacement、removeCondition 和验证 |
| 旧路径兼容 | 新 canonical path 已存在，旧字段、旧 message、旧 renderer 或旧 command 仍可返回成功 | 默认迁移或删除；新路径测试必须证明旧路径未参与 |
| 命名误伤 | `fallback` 只是 ErrorBoundary slot、错误文案、默认值、展示角色或合法领域状态 | 可保留；必要时改名降低扫描噪声 |

### 验证

涉及本 ADR 的变更必须按影响范围运行或记录以下验证：

- `pnpm check:unused`
- `pnpm check:legacy-debt`
- `pnpm check:legacy-debt:ledger`
- 相关包的 focused test/build
- 涉及 Webview runtime、CSP、message、媒体、焦点或视觉交互时，运行 `pnpm test:webview:functional` 的聚焦真实宿主场景；`pnpm smoke:webview:targets` 或等价 `vscode-extension-debugger` target 检查仅作为环境预检
- 涉及 Engine/Rust/GPU 时，运行对应 Rust focused test 或 `pnpm ci:local:rust`

如果保留兼容桥，验证必须覆盖：

- canonical path 默认命中。
- retained legacy path 不能掩盖新路径失败。
- 只有迁移、拒绝或诊断测试可以显式观测旧路径。
- 台账条目包含 owner、replacement、removeCondition、validation 和状态。

## 当前治理基线

以下清单基于 2026-06-18 审计和 2026-06-19 代码验证更新。它不是长期任务日志；2026-07-17 的 `align-pruned-workspace-build` 已删除部分当时存在的产品包，因此当前包路径与行动项只能以 workspace 和 `quality/ledgers/` 为准，已移除包不再列为可执行目标。

### 2026-06-19 fallback / legacy 复核基线

本轮复核针对用户在 VS Code 搜索中观察到的 `fallback` 数量过多问题。搜索口径为 `*.ts,*.tsx`，排除 `*.test.ts`。该口径按匹配次数计数，同一行多次出现 `fallback` 会重复计数。

| 关键词 | VS Code 搜索口径 | 行数口径 | 文件数 | 排除 `*.test.tsx`、`__tests__`、配置后的生产代码口径 |
| ------ | ---------------- | -------- | ------ | --------------------------------------------------- |
| `fallback` | 607 次匹配 | 573 行 | 205 个文件 | 586 次匹配、552 行、198 个文件 |
| `legacy` | 108 次匹配 | 94 行 | 25 个文件 | 105 次匹配、91 行、22 个文件 |

机器扫描基线：

| 口径 | 文件 | 命中文件 | 匹配次数 | `legacy` | `fallback` | `deprecated` |
| ---- | ---- | -------- | -------- | -------- | ---------- | ------------ |
| all source | 3603 | 402 | 1234 | 325 | 851 | 58 |
| non-test source | 2599 | 243 | 739 | 108 | 580 | 51 |

生产代码语义分类基线：

| 语义类 | 匹配次数 | 文件数 | 治理目标 |
| ------ | -------- | ------ | -------- |
| `delete-now` | 0 | 0 | 保持 0 |
| `migrate-now` | 2 | 2 | 清零并由 `pnpm check:legacy-debt` 阻断回归 |
| `needs-review` | 16 | 6 | 清零并由 `pnpm check:legacy-debt` 阻断回归 |
| `current-bridge` | 138 | 25 | 仅允许有 owner、replacement/removeAfter、验证命令和移除条件的台账条目 |
| `runtime-resilience` | 306 | 106 | 仅允许真实本地客户端、外部 provider、文件、媒体、取消、超时或安全边界 |
| `boundary-canonicalizer` | 81 | 35 | 仅允许边界 canonicalize 或一次性迁移，不允许内部双读成功路径 |
| `presentation-default` | 123 | 62 | React/UI/default 术语可保留，非框架默认值优先改名 |
| `domain-status` | 65 | 30 | 合法领域状态可保留 |
| `generated-source` | 7 | 2 | 通过源 schema/IDL 治理 |
| `false-positive-word` | 1 | 1 | 静态分析误伤可保留 |

当前 OpenSpec 变更 `eliminate-legacy-fallback-surfaces` 的门禁目标是：生产代码 `delete-now=0`、`migrate-now=0`、`needs-review=0`。`pnpm check:legacy-debt` 和 `pnpm check:legacy-debt:ledger` 必须在这些类非零时失败。

### 2026-06-19 收敛后扫描结果

本轮 `eliminate-legacy-fallback-surfaces` 实施后，机器扫描口径如下：

| 口径 | 文件 | 命中文件 | 匹配次数 | `legacy` | `fallback` | `deprecated` |
| ---- | ---- | -------- | -------- | -------- | ---------- | ------------ |
| all source | 3610 | 385 | 1158 | 340 | 760 | 58 |
| non-test source | 2604 | 227 | 667 | 111 | 505 | 51 |

生产代码语义分类结果：

| 语义类 | 匹配次数 | 文件数 | 当前结论 |
| ------ | -------- | ------ | -------- |
| `delete-now` | 0 | 0 | 已清零，门禁阻断回归 |
| `migrate-now` | 0 | 0 | 已清零，门禁阻断回归 |
| `needs-review` | 0 | 0 | 已清零，门禁阻断回归 |
| `current-bridge` | 141 | 24 | 只允许有 ledger owner、replacement/removeAfter、validation 的桥；AI SDK provider bridge 仍是最大保留项 |
| `runtime-resilience` | 257 | 96 | 保留真实本地客户端、外部 provider、文件、媒体、取消、超时、安全边界韧性 |
| `boundary-canonicalizer` | 74 | 32 | 保留输入边界 canonicalize、resource cache、range/visibility policy；不允许内部双读成功路径 |
| `presentation-default` | 120 | 60 | 保留 React/ErrorBoundary/UI/default 术语；非框架默认值已批量改名 |
| `domain-status` | 67 | 32 | 保留领域状态、分类 provenance、实体/market deprecation 语义 |
| `generated-source` | 7 | 2 | 由 schema/IDL 源头治理 |
| `false-positive-word` | 1 | 1 | 静态分析误伤 |

质量门禁结果：

- `pnpm check:legacy-debt`：通过，blocking classes 为 0。
- `pnpm check:legacy-debt:ledger`：通过，ledger entries checked 为 29。

本轮明确不追求全仓库 `fallback` 字符串归零。保留下来的字符串必须落入已分类语义：真实运行时韧性、边界 canonicalizer、展示默认值、领域状态、生成代码、当前迁移桥或误伤。新增生产代码若落入 `delete-now`、`migrate-now`、`needs-review`，质量门禁必须失败。

热点分布：

| 关键词 | 主要包分布 | 结论 |
| ------ | ---------- | ---- |
| `fallback` | 2026-06-19 的全仓库审计快照；其中部分包已在后续产品裁剪中删除 | 数量曾经偏高；当前分布必须重新运行质量脚本获取，不能沿用历史包计数 |
| `legacy` | `neko-agent` 88、`neko-types` 12，其余包零散 | 债务高度集中在 Agent AI SDK legacy media bridge 和少量 shared compatibility surface |

治理判断：

- 不以“本地客户端”为理由删除真实边界防御。Webview message validation、CSP/resource authorization、`asWebviewUri()`、本地文件路径授权、Engine/native 进程不可用、Disposable 生命周期和项目文件诊断仍是必要防御。
- 对内部 prelaunch canonical path，默认不再允许旧路径、静默 fallback、no-op guard 或成功默认值掩盖缺实现、缺配置、缺依赖、权限元数据缺失或 schema 不匹配。
- `fallback` 一词只能用于真实 UI fallback 或 React 语义；默认值、文件名提示、错误文案、显示名提示和颜色默认值应优先改名，降低扫描噪声。

#### 需要优先治理的 fallback / legacy

| 优先级 | 文件 | 表面 | 问题 | 默认行动 |
| ------ | ---- | ---- | ---- | -------- |
| P0 | `packages/neko-agent/packages/ai-sdk/src/resolve.ts`、`packages/neko-agent/packages/platform/src/media/media-task-executor.ts` | AI SDK provider 不支持时桥接 `LegacyMediaAdapter` | 已收敛为显式 opt-in migration bridge；不在允许列表且无 native/generic path 的 provider 返回 fail-visible diagnostic。`kling` 已迁到 compatible native path；`fal`、`dashscope`、`runway`、`luma`、`suno`、`vidu`、`midjourney`、`minimax`、`liblib` 仍保留迁移桥 | 继续按 provider sunset matrix 迁移；全部迁完或显式 unsupported 后才能删除 `LegacyMediaAdapter` exports 和 `createLegacyBridgeProvider()` |
| P0 | `packages/neko-agent/packages/agent/src/permission/rule-matcher.ts` | traits registry 缺失时 auto mode 无条件 allow | 已改为 fail-visible / ask 路径，缺权限元数据不再默认放行昂贵或不可逆工具 | 保留 focused permission tests，禁止 backward-compatible auto allow 回归 |
| P0 | `packages/neko-agent/packages/agent/src/runtime/message-runtime.ts`、`packages/neko-agent/packages/agent/src/runtime/agent-turn-runtime.ts` | 缺 Agent runtime、provider 或 platform 返回 `status: 'fallback'` | 已改为 `precondition-unmet`，明确表达前置条件未满足且未尝试执行 | 保留 runtime focused tests，避免与执行异常 `failed` 混用 |
| P1 | `packages/neko-agent/packages/agent/src/context/llm-summarizer.ts`、`packages/neko-agent/packages/agent/src/context/creative-summarizer.ts`、`packages/neko-agent/packages/agent/src/context/conversation-compressor.ts` | LLM 总结失败后生成 degraded summary | 已补结构化 `source` / `degraded` 信号，允许离线 degraded path 但不伪装成 LLM 产出 | 后续 UI/telemetry 可直接消费 provenance |
| P1 | `packages/neko-assets/src/services/LLMClassifier.ts` | LLM 分类失败后调用本地 classifier | 已为 `ClassificationResult` 增加 `source?: 'llm' | 'fallback'` 与 `degraded?: boolean`，focused tests 覆盖 LLM 与 degraded 本地路径 | 保留外部 AI 不可用降级；schema/contract bug 不得用静默成功隐藏 |
| P1 | `packages/neko-agent/packages/extension/src/bootstrap/toolBootstrap.ts` | 中央 tool `compatibility-bridge` | 已迁到 owner capability providers：document、media、search；`toolBootstrap` 只保留 Agent-owned plugin skill discovery | `scripts/check-neko-agent-boundaries.mjs` 阻断中央 domain tool factory 回归 |
| P2 | `packages/neko-canvas/packages/extension/src/extension.ts`、Tools | command-level proxy fallback 到旧 `neko.assets.getAllEntities` | 保留调用方已迁到 typed `NekoAssetsAPI.getAllEntities()` 或 owning facade；旧 command registration 已删除 | 继续保留 typed API unavailable 的 fail-visible tests |

#### 应保留但应降噪的 fallback

| 表面 | 当前含义 | 推荐命名或处理 |
| ---- | -------- | -------------- |
| `fallbackMessage` | 保存失败默认错误文案 | 已改为 `defaultMessage` |
| `fallbackName`、`fileNameFallback` | 文件名或显示名默认值 | 已改为 `defaultFileName`、`defaultProjectName`、`defaultName`、`toolNameHint`、`sourceNameHint` 或 `secondaryNames` |
| 数值、尺寸、颜色 fallback | 默认值 clamp 或 CSS token 默认值 | 改为 `defaultValue`、`defaultWidth`、`defaultColor` |
| React `Suspense fallback`、ErrorBoundary `fallback` | React / UI fallback 正常语义 | 保留；在 debt scan 白名单中标注 |
| `allowRecentVisibleFallback`、`allowSingleVisibleFallback` | Webview panel 解析策略 | 可保留，或改为 `resolutionPolicy` 降低误报 |
| document range fallback、media codec fallback | 真实 VS Code/Engine/媒体边界降级 | 保留，但结果必须返回 diagnostic，不静默成功 |

代码验证补充：

- AI SDK legacy bridge 不能直接删除。当前非原生媒体 provider 仍通过 `MediaAdapter` bridge 工作；治理目标是让 bridge 可观测、可测试隔离、可按 provider 迁移，而不是一次性断开功能。
- Permission auto fallback 风险等级为高。traits registry 缺失时默认 allow 不属于 UI 降级，而是权限边界放宽；修复时应同步更新 legacy/backward-compatible 测试。
- Agent runtime `status: 'fallback'` 的重命名应避免复用 `failed`，因为 `failed` 已表示执行中异常；更准确的 contract 是 `precondition-unmet` 或 `setup-incomplete`。
- LLM summarizer/classifier 的 fallback 是缺少 provenance 的问题。允许本地 degraded path，但必须让结果类型携带 `source`、`degraded` 或 diagnostic，不能只靠日志或文本前缀表达。
- `workspaceProjectSearch.ts` 的 mention provider 已复核为语义字符串输出，`MentionMenu.tsx` 当前也不再包含 `isLegacyMentionEmojiIcon` / `projectLegacyMentionEmojiToken`；emoji 旧路径清理结论成立。

命名降噪分批：

| 批次 | 表面 | 影响 | 行动 |
| ---- | ---- | ---- | ---- |
| P1 | `fallbackMessage` | 约 3 个核心文件、十余处调用 | 已改为 `defaultMessage`，同步 shared project-file-io 类型 |
| P1 | `fallbackName`、`fileNameFallback` | 约十余个文件、三十余处调用 | 已改为 `defaultFileName` / `defaultProjectName` / `defaultName` / `toolNameHint` / `sourceNameHint` / `secondaryNames` |
| P2 | `allowRecentVisibleFallback`、`allowSingleVisibleFallback` | 多个 editor provider 与 focused-webview tests | 暂不强制改名；如后续改动 focused webview registry，可收敛为 `resolutionPolicy` |
| 保留 | React `Suspense fallback`、ErrorBoundary `fallback` | React / UI 正常术语 | 保留并加入 debt scan 白名单 |

### 已清理或已收敛

| 文件 | 符号或表面 | 结论 | 行动 |
| ---- | ---------- | ---- | ---- |
| `packages/neko-agent/packages/webview/src/components/ChatView/AgentStateIndicator.tsx` | `AgentStateIndicatorCompact` | 文件在 Agent Webview 内无引用 | 删除文件 |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/ComposerIcons.tsx` | `AgentWorkflowIcon`、`MediaImageIcon`、`MediaVideoIcon`、`MediaAudioIcon` | 内部仍被 `SessionModeIcon` 间接使用，但不需要 public export | 移除多余 `export`，保留实现 |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/useDropdownDirection.ts` | `useDropdownDirection` | 无引用；同文件 `useDropdownPlacement` 仍有效 | 删除旧 helper export |
| `packages/neko-canvas/packages/webview/src/hooks/useDragDrop.ts` | `createCanvasAssetAddSourceInput`、`readCanvasAddSourceMetadata` | 同文件内部使用，外部无引用 | 移除多余 `export`，保留实现 |
| `packages/neko-agent/packages/agent/src/runtime/message-resource-projector.ts` | `MessageWithLegacyToolCalls`、`messageHasLegacyToolCalls` | `Message` 类型已无 `toolCalls` 字段；所有消息构建代码走 `contentBlocks` | 删除不可达 legacy 分支、类型和 guard |
| `packages/neko-cut/packages/extension/src/editor/video/cutProjectFilePersistence.ts` | `formatCutProjectFileDiagnostics` | 与 shared `formatProjectFileDiagnostics` 重复 | 删除本地 wrapper，调用方改用 `@neko/shared` |
| `packages/neko-types/src/icons/action.tsx`、`packages/neko-agent/packages/webview/src/components/ChatView/MediaPreview/*` | `OpenIcon`、`ErrorIcon`、`ChevronIcon`、`PlayIcon` | MediaPreview 内 `ErrorIcon`、`ChevronIcon`、`OpenIcon`、`PlayIcon` 手写重复；`@neko/shared/icons` 已有多数图标，仅缺 `OpenIcon` | 补共享 `OpenIcon`，MediaPreview 改用 `@neko/shared/icons`；保留语义不同的本地媒体图标和 spinner |
| `packages/neko-preview/packages/extension/src/providers/previewProviderHelper.ts` | `createReadonlyPreviewDocument`、`setupPreviewWebviewPanel`、`getPreviewFileName`、`getPreviewErrorHtml` | `VideoPreviewProvider`、`AudioPreviewProvider`、`PanoramicImagePreviewProvider`、`PanoramicVideoPreviewProvider` 中 readonly document、Webview 配置、HTML 初始化、文件名显示和错误 HTML 样板重复 | 抽 package-local helper；各 provider 的消息协议、stream 状态、manifest 生命周期仍留在 owning provider |
| `packages/neko-agent/packages/extension/src/services/workspaceProjectSearch.ts`、`packages/neko-agent/packages/webview/src/components/ChatView/InputArea/MentionMenu.tsx` | workspace mention icon emoji 旧路径 | provider 端已改为返回 `video`、`audio`、`image`、`sequence`、`document`、`file` 等语义字符串；Webview 不再依赖 emoji projection | 删除 `isLegacyMentionEmojiIcon` 和 `projectLegacyMentionEmojiToken`；focused tests 断言 emoji 不再作为 generic file 成功路径 |
| `packages/neko-types/src/project-file-io/save-session.ts`、`project-file-save-session.ts` 及保留 Canvas/Cut 调用方 | `fallbackMessage` | 默认错误文案不是兼容 fallback | 改为 `defaultMessage` |
| `packages/neko-types/src/project-file-io/add-source.ts` 及保留 Cut/Canvas source-add 调用方 | `fileNameFallback` | 源文件名默认值不是兼容 fallback | 改为 `defaultFileName` / `sourceNameHint` |
| `packages/neko-canvas/packages/webview/src/hooks/useDragDrop.ts`、`CanvasApp.tsx` | `fallbackName`、`fallbackMediaType`、`getCanvasFilePickerFallbackName` | 拖拽/文件选择默认名和媒体类型提示不是兼容 fallback | 改为 `sourceNameHint`、`mediaTypeHint`、`getCanvasFilePickerDefaultName` |
| `packages/neko-types/src/vscode/extension/document-resource-cache-provider.ts`、`packages/neko-agent/packages/agent/src/session/agent-session.ts` | `fallbackName`、`fallbackNames` | 缓存条目名和工具名默认值不是兼容 fallback | 改为 `defaultName`、`toolNameHint` |
| `scripts/check-legacy-debt-surfaces.mjs` | `needs-review` scanner 分类 | `ClassificationResult.source: 'fallback'`、`NARRATIVE_PRODUCTION_BINDING_ROLES`、`@neko/ui` ErrorBoundary fallback 是合法 provenance / 领域角色 / React UI term | 分类为 `domain-status` 或 `presentation-default`，并加入 self-test |

### 需要迁移的旧路径

本 ADR 本轮跟踪的待迁移旧路径已清空。全仓库仍可能存在其他 ledger 跟踪的 `migrate-now` 项；新增旧路径时必须补充 owner、replacement、验证命令和移除条件。

### 当前保留的兼容桥

| 文件 | 表面 | 保留原因 | 移除条件 |
| ---- | ---- | -------- | -------- |
| `packages/neko-agent/packages/ai-sdk/src/bridge/legacy-*` | Legacy MediaAdapter 到 AI SDK model bridge | 当前仍承担 9 个 provider 的显式迁移桥职责：`fal`、`dashscope`、`runway`、`luma`、`suno`、`vidu`、`midjourney`、`minimax`、`liblib`；`kling` 已迁到 compatible native path | 所有剩余 provider 迁到 AI SDK 原生/generic path 或显式 unsupported，且 focused tests 证明旧 adapter 不再默认命中 |
| `packages/neko-search/src/host-vscode/compatAdapters.ts` | `createCompatibilityProjectSearchAdapters` | 当前 project-search host bridge，已由台账 `LCDR-029` 跟踪 | `registerProjectSearchService()` 不再需要 compatibility adapters，Agent 从 owner-provided provider registration 创建 adapters |

### 重复实现热点

当前无本 ADR 跟踪的高优先级重复实现热点。新增热点应先做复用审计，再进入本节或转入 `openspec/changes/`。

### 命名误伤

以下表面不视为 legacy debt，除非它们后来被用作旧路径兼容：

- `@neko/ui/error-boundary` 的 `fallback` props：React ErrorBoundary fallback UI。
- `@neko/shared/project-file-io` 的 `defaultMessage`：保存失败默认错误文案。
- `@neko/shared/asset/classifier` 的 `source: 'fallback'`：结构化 degraded provenance，不是旧路径兼容。
- `NARRATIVE_PRODUCTION_BINDING_ROLES` 中的 `'fallback'`：领域绑定角色。
- 展示默认值、CSS token 默认值、空状态文案和运行时错误 UI。

## 架构约束

- 不为单个页面或单个包复制公共 icon、ErrorBoundary、logger、theme token、i18n runtime、project file IO、path resolver、Engine client 或 Webview bridge。
- 两个以上包需要同类 provider、registry、bridge、protocol、message router、status bar、history、selection、projector 或 adapter 时，优先抽共享 contract、domain service、adapter factory、registry、strategy、hook 或 test utility。
- 保留 package-local 实现时，必须能解释职责、生命周期、领域语义、依赖方向或运行环境为何不同。
- 清理 legacy path 时可以破坏未发布内部 payload，但必须说明旧数据策略：迁移、重建、忽略、拒绝或 fail-closed diagnostic。
- 新路径验收必须是路径级验收，不只断言最终结果成功。

## 后果

正向影响：

- `pnpm check:unused` 可以从“已知失败”恢复为有用的门禁。
- 兼容桥保留时有清晰 owner 和移除条件。
- 重复代码从“局部实现方便”转为“需要复用审计”的架构风险。
- 新功能更容易落到 `@neko/shared`、`@neko/ui`、`@neko/neko-client`、`@neko/search` 或 owning domain service 的正确边界。

代价：

- 删除旧路径会让部分未发布草稿数据需要重建、重新导入或走显式迁移。
- 提取共享 helper 需要额外 focused tests，尤其 Webview runtime、媒体和 GPU/WebGL 路径。
- 一些合法 fallback 命名可能继续被扫描器报告，需要通过语义分类或改名降低噪声。
