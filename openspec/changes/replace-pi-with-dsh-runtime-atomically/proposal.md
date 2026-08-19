## Why

OpenNeko 当前仍在 `@neko/agent-runtime` 内直接维护 Pi conversation runtime，并重复拥有 Agent loop、Session、Tool registry、消息队列、Skill Host、MCP Manager、Plugin runtime 与事件投影。继续沿“内嵌 DSH/Cordis Context”方向会让 Electron Main 与 DSH 共享同一进程和同一代码执行边界，既无法满足 DSH 官方 `dsh-acp` rc.7 automation-only 的现实约束，也会扩大任意代码注入 Electron Main/DSH 的攻击面。

本变更改为由 Desktop Main 启动一个独立的 DSH 子进程，并让唯一生产通信路径成为 ACP JSON-RPC over stdio。DSH 子进程/profile 是 Agent、Session/transcript、Inbox/queue、Tool registration/execution lifecycle、Skill、MCP、Plugin 及其 extension catalog/config/readiness 的唯一 runtime authority；OpenNeko 只保留产品层 authority：Conversation/Workspace binding、凭据、Host 权限/信任、原生管理 UI 与短生命周期 projection、领域事实/Job、typed domain tool contracts 与 Host adapters。由于 `dsh-acp` rc.7 是 automation-only，本变更同时引入一个薄的、OpenNeko-owned 且随产品发布的 DSH ACP bridge plugin/profile，复用 DSH 公开 Agent/Session API 补齐产品所需的标准 ACP 语义，并只在标准 ACP 无法表达时提供最小 canonical extension。

## What Changes

- **BREAKING**：Desktop Main 启动独立 DSH 子进程；唯一生产通信路径为 ACP JSON-RPC stdio。OpenNeko 不内嵌 Cordis/`ctx.agents`，不使用 DSH Web/Client Runtime、TS SDK、Remote API、Pi 或自研 runtime fallback。
- **BREAKING**：DSH 子进程/profile 成为 Agent、Session/transcript、Inbox/queue、Tool registration/execution lifecycle、Skill、MCP、Plugin 的唯一 runtime authority；删除 OpenNeko 对 Pi Agent/Session/Skill/Tool loop、自研 Tool registry、消息队列、Skill Host、MCP Manager、Plugin runtime 和全部替代执行路径的直接依赖。
- **BREAKING**：删除作为实现前置 D0 执行，而不是等新路径完成后再删除。迁移集成分支允许暂时无法编译或运行；旧 producer、registration、public export 与依赖删除后产生的每个失败都必须作为 ACP/DSH 接入清单显式修复，禁止用 stub、no-op、兼容 adapter 或临时恢复旧代码隐藏缺口。
- OpenNeko 保留已定稿的 Electron 原生 Agent UI、产品 Shell 与薄 Desktop Main 组合根，并继续拥有 Conversation/Workspace binding、凭据、Host 权限/信任、extension 管理 UI/命令入口与短生命周期 projection、领域事实/Job、typed domain tool contracts 和 Host adapters；DSH cutover 只替换 runtime authority 和数据源，不得把既有 Agent 消息层级、Markdown、Tool/approval presentation、composer 视觉与交互降级成协议调试页，也不拥有 DSH extension catalog/config/readiness facts。
- 新增 OpenNeko-owned、随产品发布的 DSH ACP bridge plugin/profile：复用 DSH 公开 Agent/Session API 补齐标准 ACP 的 session list/load/resume/history replay、tool/progress events、per-session close；仅在标准 ACP 无法表达时提供最小 canonical extension：DSH inbox snapshot/edit/remove、官方 extension inventory/readiness/config/diagnostics、DSH→Host typed domain tool request/response。
- Bridge 不得实现第二套 Agent loop、Session store、queue、tool registry、Skill/MCP/Plugin runtime。
- 首版仅支持随 OpenNeko 发布、由官方维护并精确锁定的 DSH profile/plugins；暂不提供 OpenNeko 自研第三方插件 runtime、第三方 Webview JS 或任意第三方 JS 注入 Electron Main/DSH。
- Generation 与 Canvas 作为首批纵向官方领域 Tool slice 注册到 DSH；Cut、Assets、Character、World 等随后迁移。DSH 拥有调用 lifecycle，owning packages 拥有 schema、semantic validation、authorization、exact resource identity、业务事务、事实与长任务 Job；UI 直接操作不绕 Agent；领域能力不用 MCP 包装。
- 保留旧 Pi Session JSONL 与 `pi_*` 本地记录的原始字节，不覆盖、不静默迁移、不回退旧 reader、不伪造空 transcript。
- 保留原子切换、旧 Pi 数据保护、无内部 contract 版本、无双路径。
- D0 只删除仓库中的旧执行代码、注册、导出和依赖；旧 Pi Session JSONL、数据库、用户目录内容与数据保护 fixture 不属于删除目标。

## Capabilities

### New Capabilities

- `dsh-agent-runtime-authority`: DSH 独立子进程是 Agent、Session/transcript、Inbox/queue 与 Tool lifecycle 的唯一 runtime authority；OpenNeko 仅通过 ACP JSON-RPC stdio 通信。
- `dsh-extension-runtime-boundary`: DSH profile 拥有 Skill、MCP、Plugin 的实际发现/加载/启停/执行；OpenNeko 管理面通过 bridge 投影 inventory/readiness/config/diagnostics，不保留自研 Skill Host、MCP Manager、Plugin runtime。
- `atomic-agent-runtime-cutover`: 并行工作流、共享 contract 冻结、统一集成门禁与一次原子发布；Generation+Canvas 作为首批纵向 Tool slice，其他领域随后迁移。

### Modified Capabilities

- `agent-storage-authority`: transcript/context authority 从 Pi Session 改为 DSH 子进程中的 DSH Session；旧 Pi 数据保留为不可执行诊断。
- `local-storage-authority-policy`: DSH Session persistence 由 DSH profile 在官方锁定的用户全局存储中拥有；Host 只提供边界配置与 Host adapter，不复制 transcript，不暴露物理路径。

## Impact

- `packages/agent/runtime`：从内嵌 runtime 组合改为 host-neutral ACP application client、Conversation/Session binding 协调与 canonical projection；不启动进程，也不再拥有 Agent loop、Session store、Tool registry、消息队列、Skill Host、MCP Manager 或 Plugin runtime。
- `packages/host`：`settings` public entry 拥有 program-owned provider credential authority、配置优先级、精确 provider identity 与 SecretStorage key 语义；不依赖 Agent/Pi/DSH runtime，也不投影 secret。
- `apps/neko-desktop`：保持已定稿的 Electron 原生 UI 和薄组合根；Renderer 只把 canonical DSH projection 投影到既有产品视觉与交互，不承载协议 authority；Desktop Main 只在 trust boundary 启动/监督 DSH 子进程、承载 stdio、实现 SecretStorage、sender-bound IPC 与 OS/领域 concrete Host adapters，不拥有 Agent/Session/extension 业务状态机。
- owning domain packages：Canvas/Generation 首批迁移，Cut/Assets/Character/World 随后；继续拥有 schema、semantic validation、authorization、exact resource identity、业务事务、事实与长任务 Job；领域能力不以 MCP 包装。
- `scripts/dsh-q0`：非发布 fixture 验证 subprocess lifecycle、stdout purity、handshake/capability、session recovery/history、progress、permission、cancel、inbox、Host tool reverse requests、extension management、crash/restart/fail-local；已知 dsh CLI 可正常使用，不重复安装验证。真实 Provider 基线已通过可见 Desktop UI、产品 Composer、DSH/ACP 与真实 API 完成；完整 Provider/Model、approval、领域 Tool、重开与发布矩阵仍由统一发布门禁约束。
- 依赖与数据：精确锁定随产品发布的 DSH profile/plugins 与 dsh-acp rc.7 兼容闭包；不保留 Pi 直接依赖、Remote API、TS SDK 或自研 runtime fallback。
