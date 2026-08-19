# W1 Provider Runtime And Visible Desktop Evidence

日期：2026-08-19

## Scope

- 验证 Desktop 启动时从 Host Provider/LLM catalog 生成唯一 DSH 官方 `llm-pi-ai` route snapshot。
- 验证产品 Provider identity 与 API model name 精确传入 DSH，不使用 `deepseek-official` alias、Pi runtime 或 Provider fallback。
- 验证凭据不进入 writable profile、ACP request、DSH Session 或 Renderer projection。
- 通过用户可操作的可见 Electron Composer 验证 Workspace Conversation 的真实 API 双轮对话。

## Canonical Path

`@neko/host/settings` enabled Provider/LLM catalog + `ProviderCredentialAuthority`
→ Desktop provider runtime projection
→ writable official DSH profile + subprocess-only credential environment
→ DSH `llm-pi-ai`
→ ACP Session
→ package-owned projection
→ sender-bound Desktop IPC/preload
→ retained Agent UI components。

禁止成功路径：Pi、自研 Skill/MCP/Plugin runtime、`deepseek-official` alias、Provider fallback、DSH durable credential、父进程任意 credential discovery。

## Deterministic Evidence

- writable profile 的唯一 patch entry 为 `llm-pi-ai`，声明 `nekoapi-chat` 与 `deepseek-chat`；每条 credential 只保存符合环境变量名称格式的 `apiKeyEnv` 引用。
- Provider projection、Composer、profile materializer、runtime bootstrap、Session/ACP 相关矩阵：35 个文件、211 个测试全部通过。
- `pnpm typecheck:desktop` 通过。
- `pnpm check:agent-boundaries` 与 `pnpm check:application-boundaries` 通过。
- `pnpm test:agent:eval` 通过：45 个文件、314 个 key-free runner 测试；27 个 suite、80 个 case 的全量 dry-run 索引有效。该结果不冒充真实 Agent 行为证据。
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`、focused ESLint、`pnpm check:legacy-debt` 与 `git diff --check` 通过。
- `pnpm check:unused` 仍报告仓库既有 6 个未使用文件与 182 个未使用导出；本变更新增 Provider/Composer 文件不在报告中，本任务未清理无关基线。

## Visible Desktop And Real Provider

Authoritative runtime：开发 closure 启动的可见 Electron Desktop；未使用 automation bridge、direct turn runner、mock provider 或预置数据库发起回合。

1. 从侧边栏进入 `Blame` Workspace，Composer 显示 `Blame / Workspace Board` 上下文。
2. 在原模型配置组件中选择 `Neko API Chat / GPT 5.6 Luna`。
3. 通过 Composer 提交第一轮请求；DSH 持久事件记录 assistant source 为 `provider=nekoapi-chat`、`model=gpt-5.6-luna`，并以 `turn/end: completed` 收敛。
4. 通过 Conversation 导航重开同一精确会话，UI 显示第一轮用户消息、助手回复和 completed 终态。
5. 在同一 Conversation 提交第二轮 `Reply exactly: second-turn-ok`；UI 实时显示助手 `second-turn-ok` 和 `回合 2 已结束 · completed`，模型与 Workspace 上下文未改变。

DSH Session artifact 位于 `${APP_USER_DATA}/dsh/sessions/<virtual-cwd>/<session-id>/session.jsonl.zstd`；证据只记录稳定 provider/model/turn facts，不记录 credential 或绝对用户路径。

## Result And Residual Risk

- 功能结果：通过。真实 Provider、真实模型、DSH/ACP 双轮、Conversation 导航和 Workspace binding 已贯通。
- no-fallback 结果：通过。持久 source 精确指向 `nekoapi-chat / gpt-5.6-luna`，没有 Pi 或 alias/fallback 参与。
- 视觉结果：阻塞。Computer Use accessibility tree 已显示完成后的双轮内容与上下文，但其像素截图持续返回交互前的旧帧，不能把该截图作为当前视觉状态的通过证据。
- 未覆盖：其他 Provider/Model、approval、领域 Tool、应用完整重开与 transcript 恢复、hidden batch、成本/usage 和发布 closure artifact。
