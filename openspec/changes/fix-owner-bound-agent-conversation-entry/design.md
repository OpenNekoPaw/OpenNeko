# Design

## Boundary

- Canonical public path: owner-bound Surface 使用 Agent Host Runtime adapter，Conversation 创建后所有用户消息均通过 `sendMessage`/Conversation controller。
- Entry-only path: Agent Director / Entry 使用 Agent Launch adapter，并可调用 `submitDraft` 将未绑定入口意图提交为 Conversation。
- Producer: Agent Webview composer and Conversation controller.
- Consumer: Agent runtime Conversation application service and Desktop typed bridge.
- Runtime boundary: Renderer 只传递 typed input；Desktop Main 验证 sender、Window、Surface 和 owner identity；Agent runtime 持有 Conversation durable/runtime 生命周期。

## Replaced Path

删除 Workspace draft 先 `agentLaunch.attach`、再 `submitDraft`、最后切换为 session 的成功路径。Workspace Surface 即使仍以空会话 presentation 展示，也不得取得 Draft Host adapter；测试将 poison `agentLaunch.attach` 与 `submitDraft` 证明其不可达。

## Ownership And Coupling

Conversation identity、owner binding、首发和后续 turn 属于 `@neko/agent-runtime`，不得由 React state、Desktop Shell Draft 或 active Workspace fallback 决定。Host Scene 只投影 runtime 返回的精确 Conversation identity，不成为第二事实来源。

Workspace Surface 使用 `runtimeId + draftId + workspaceId` 作为一次挂载创建请求的精确去重键。创建请求发出后，首发只进入待发送输入并等待该 Conversation 投影，不得再次调用 `newConversation`。Conversation 投影后，模型设置、输入目录和 Workspace mention 查询全部使用该精确 Conversation identity。

## User Data And Failure

创建或首发失败只影响当前 Conversation 请求并返回明确 diagnostic；不得清空 sibling Conversation、Workspace catalog 或用户附件。失败不得重试到 Entry submit，也不得回退 active/recent Workspace。

## Verification

- Producer test: Workspace composer 首发完整传递 attachments/fileReferences/context/canvas input。
- Consumer test: owner-bound Conversation 创建和首发命中唯一 runtime owner。
- Deletion/poison test: Workspace 不调用 Agent Launch attach/submitDraft；Entry 仍调用 submitDraft。
- Runtime test: Desktop Scene 从精确 Workspace owner 创建并恢复 Conversation，不依赖 active identity fallback。
