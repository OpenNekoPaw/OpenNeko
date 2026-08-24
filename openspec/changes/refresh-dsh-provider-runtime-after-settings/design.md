## Context

ConfigManager 在每次设置修改后已经 reload canonical TOML，但 `createDesktopDshProviderRuntimeProjection`、profile materialization、subprocess environment 和 composer execution catalog 只在 Desktop 启动时创建一次。仅修改设置响应文案会让旧 runtime 被伪装成已生效，违反 fail-visible 与唯一成功路径约束。

五层分析：配置事实仍由 Host settings owner 决定；DSH process/profile/catalog 生命周期由 Desktop DSH runtime owner 决定；接口只传递“execution configuration changed”和 runtime effect；扩展通过每次 runtime start 重新读取同一 authority；测试覆盖配置生产者、runtime 消费者、运行 turn 保护、新会话使用和旧重启路径删除。

## Decisions

### 1. 每次 DSH generation 启动都从 canonical authority 重物化

Desktop product runtime 接收 Provider projection source，而不是固定的启动 projection/supervisor。初次启动和局部刷新都调用同一 prepare 路径，重新读取 ConfigManager 与 CredentialAuthority、物化 profile、构造 credential environment 和 subprocess。

候选 execution catalog 只能在对应 ACP connection 成功后发布。连接失败时 runtime 进入局部 unavailable diagnostic，不得继续广告旧 catalog 或回退旧 subprocess。

### 2. 保留稳定的 Conversation owner，替换易失 runtime generation

局部刷新只替换 DSH subprocess、ACP client generation、profile projection 和 execution catalog。持久 Conversation catalog、Conversation↔DSH session binding、transcript 与精确 session identity 继续由现有 application owner 持有；刷新后按需通过 canonical load/resume 恢复。

### 3. 运行中 turn 采用排队刷新

Provider/model 结构修改请求 runtime refresh。若当前没有 in-flight prompt 或 projected turn，runtime 立即进入 `restarting` 并阻止新工作，随后连接新 generation。若存在运行中 turn，刷新标记为 pending；已经开始的 prompt 继续，新的 prompt/session 创建被明确拒绝，最后一个活动 prompt/turn 结束后自动执行同一刷新。

该策略不静默取消用户任务，也不允许 pending 期间的新会话继续使用旧 catalog。多次 pending 修改合并为一次从最新 canonical authority 重物化，不建立配置快照队列。

### 4. 设置响应表达 runtime effect，不表达应用重启

Host settings service 返回 `executionConfigurationChanged`。Desktop AppHost 在成功写入后请求 runtime refresh，并把 strict IPC 响应投影为 `runtimeEffect: unchanged | applied | pending`。Renderer 仅在 pending 时显示“当前任务结束后自动应用”的状态；失败直接显示 owning boundary diagnostic。

默认模型引用同样属于 DSH execution configuration。修改默认模型时复用相同的局部刷新路径，确保后续新会话读取最新默认值；已经运行的会话与任务仍保持原 runtime generation。

## Runtime Boundary

- Owner: Host settings owner for config facts; Desktop DSH runtime owner for process/profile/catalog lifecycle.
- Package role: `@neko/host` is host-neutral config application service; `apps/neko-desktop` is Electron/runtime composition and concrete subprocess adapter.
- Canonical public path: Settings Renderer → typed preload IPC → AppHost → model-settings service → ConfigManager/CredentialAuthority → DSH runtime refresh → profile materializer → subprocess/ACP → stable execution catalog.
- Producer: ConfigManager and ProviderCredentialAuthority.
- Consumer: DSH profile materializer, DSH ACP subprocess, Agent composer model resolver.
- Runtime boundary: Electron Main owns subprocess and credential environment; Renderer receives only status/projection.
- Replaced path: fixed startup Provider projection plus whole-application restart notice.
- User-data impact: explicit canonical config/secret changes only; no transcript, Conversation, project or existing session mutation.
- App-local justification: subprocess lifecycle, Electron process environment and packaged resource resolution require the Desktop Application boundary; Provider validation and config facts remain host-neutral.

## Failure Semantics

- Candidate materialization or ACP connection failure makes only DSH runtime unavailable and returns/publishes a visible diagnostic.
- Sibling Desktop scenes, projects and durable conversations remain accessible.
- The previous catalog is not retained as a fallback after a failed refresh.
- Active prompts are never killed by settings refresh; pending refresh blocks new DSH work until applied.
