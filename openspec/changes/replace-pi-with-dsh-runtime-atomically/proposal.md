## Why

OpenNeko 当前直接维护 Pi conversation runtime，并重复拥有 Agent loop、Session、Tool、Skill、MCP、Plugin runtime、队列与事件投影。采用 DSH/Cordis 可以删除这些非差异化执行栈，但迁移必须作为一个整体发布单元完成，不能形成 Pi/DSH 双路径或缺失部分能力的中间产品版本。

## What Changes

- **BREAKING**：由 `@neko/agent-runtime` 组合最小 DSH/Cordis runtime，统一拥有 Agent、Session、Tool、Skill、MCP 与 Plugin 执行生命周期；删除 OpenNeko 对 Pi Agent/Session/Skill/Tool loop 的直接依赖和全部替代自研执行路径。
- **BREAKING**：将 Agent/Tool 身份切换为经 Q0 验证并冻结的 DSH Session/turn/call identity，删除 Agent 通用 `branchId`、`runId`、Pi identity、自研 clear/rollback/compaction contract；领域 Job identity 保持由 owning domain 拥有。
- 保留 OpenNeko Conversation catalog、Workspace/Project binding、CredentialStore、成本授权、Skill/Plugin catalog 与信任、Workspace 资源授权、领域事实/Job、媒体数据面和 Renderer 产品投影。
- 为 OpenNeko CredentialStore、trusted Skill catalog、Plugin catalog、领域 Tool 与 Session persistence 提供最小 DSH boundary implementation；普通用户 Skill 不直接交给 trusted filesystem provider，第三方 Plugin 不获得隐式 Electron Main 任意代码执行权限。
- 明确定义旧 Pi Session JSONL 与 `pi_*` 本地记录的保留、不可执行 diagnostic、用户修复/删除边界；不得覆盖、静默迁移、回退旧 reader 或伪造空 transcript。
- 迁移允许拆成隔离分支/worktree 中的并行工程工作流，但所有工作流必须汇入同一集成分支；任何子工作流不得单独合入可发布主线、打包、发版或宣称上线。
- 只有 DSH 依赖资格、共享 contract、全部 producer/consumer、旧路径删除、真实 Desktop/provider Evaluation 和用户数据保护门禁同时通过后，才执行一次原子发布切换。
- 本变更接受后取代未完成的 `adopt-pi-agent-runtime` 具体方向；`purify-agent-contracts` 保持独立依赖，`add-desktop-agent-evaluation-matrix` 继续作为外部验收平台而不是迁移 runtime owner。

## Capabilities

### New Capabilities

- `dsh-agent-runtime-authority`: DSH/Cordis Agent、Session、Tool 与产品投影的单一运行时 authority、生命周期、身份和 no-fallback 要求。
- `dsh-extension-runtime-boundary`: DSH Skill、MCP 与 Cordis Plugin runtime 接入 OpenNeko catalog、信任、授权和 fail-local 边界。
- `atomic-agent-runtime-cutover`: 并行开发工作流、共享 contract 冻结、统一集成门禁和一次原子发布要求。

### Modified Capabilities

- `agent-storage-authority`: 将 transcript/context authority 从 Pi Session 改为 DSH Session，并定义旧 Pi 数据的保留和局部失效语义。
- `local-storage-authority-policy`: 增加 DSH Session persistence、虚拟 cwd/path 与旧 Pi 存储的用户数据保护要求。

## Impact

- `packages/agent/runtime`：继续拥有 host-neutral Agent application/runtime composition，新增最小 Cordis Context 与 OpenNeko DSH boundary；删除 Pi、Tool registry、消息队列、MCP、Skill、Plugin contribution 和旧 projection 重复实现。
- `packages/agent/contracts` 与相关 Agent domain/Webview consumer：一次性更新 Session/turn/call、queue、clear/compact、Timeline、diagnostic 和 Extension 投影的 canonical shape；不保留内部版本或兼容 re-export。
- owning domain packages：继续拥有 Canvas、Cut、Generation、Assets、Character、World 等领域事实与 Job，仅更新 DSH Tool adapter 的 schema、校验和精确 identity 消费。
- `apps/neko-desktop`：保持薄 Electron 组合根，只创建 root Context、实现 sender-bound IPC、OS Credential/文件/进程 concrete adapter、窗口生命周期和 package wiring；不得拥有 DSH 业务规则或第二套 Session 状态机。
- `scripts/agent-eval`：复用现有 Desktop complete-session driver、真实 provider 和可见 UI lane 更新 canonical path evidence，不新增 direct runtime runner。
- 依赖与数据：精确固定完整 DSH RC package closure；退役 OpenNeko 对 `@earendil-works/pi-agent-core` 的直接依赖，允许 DSH provider-specific adapter 暂时间接依赖 `@earendil-works/pi-ai`；保留旧 Pi 用户数据但不让其成为成功 fallback。
