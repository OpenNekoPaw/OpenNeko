# Design

## Boundary

- Canonical public path: owner-bound Surface 使用 Agent Host Runtime adapter，Conversation 创建后所有用户消息均通过 `sendMessage`/Conversation controller。
- Entry-only path: Agent Director / Entry 使用 Agent Launch adapter，并可调用 `submitDraft` 将未绑定入口意图提交为 Conversation。
- Presentation state: Entry 使用 `draft`；精确 owner 已绑定但尚无 Conversation 时使用 `composer`；创建成功后使用 `session`。`composer` 必须携带完整 owner binding，且不得携带或创建空 Conversation。
- Producer: Agent Webview composer and Conversation controller.
- Consumer: Agent runtime Conversation application service and Desktop typed bridge.
- Runtime boundary: Renderer 只传递 typed input；Desktop Main 验证 sender、Window、Surface 和 owner identity；Agent runtime 持有 Conversation durable/runtime 生命周期。

## Replaced Path

删除 Workspace draft 先 `agentLaunch.attach`、再 `submitDraft`、最后切换为 session 的成功路径。Workspace Surface 即使仍以空会话 presentation 展示，也不得取得 Draft Host adapter；测试将 poison `agentLaunch.attach` 与 `submitDraft` 证明其不可达。

## Ownership And Coupling

Conversation identity、owner binding、首发和后续 turn 属于 `@neko/agent-runtime`，不得由 React state、Desktop Shell Draft 或 active Workspace fallback 决定。Host Scene 只投影 runtime 返回的精确 Conversation identity，不成为第二事实来源。

首发前模型配置与输入目录由同一个 Agent runtime 基于 Composer 的精确 owner 投影。该目录只用于展示和构造待发送输入；Conversation 创建后，执行前仍通过 canonical Session catalog 对 `$` Skill 与 `/` Command 做最终校验，不形成第二条执行路径。

## User Data And Failure

创建或首发失败只影响当前 Conversation 请求并返回明确 diagnostic；不得清空 sibling Conversation、Workspace catalog 或用户附件。失败不得重试到 Entry submit，也不得回退 active/recent Workspace。

Owner-bound Composer 的首次输入必须在 Conversation lifecycle record 持久化的同一 canonical transaction 中被接受。Session tab、配置读取和 Session input catalog 只能在该事务成功后对 Renderer 可见；不得通过延迟、重试、空 lifecycle record 或读取 Composer 配置作为 Session 配置 fallback 绕过这一顺序。

## Verification

- Producer test: Workspace composer 首发完整传递 attachments/fileReferences/context/canvas input。
- Consumer test: owner-bound Conversation 创建和首发命中唯一 runtime owner。
- Deletion/poison test: Workspace 不调用 Agent Launch attach/submitDraft；Entry 仍调用 submitDraft。
- Runtime test: Desktop Scene 从精确 Workspace owner 创建并恢复 Conversation，不依赖 active identity fallback。
- Ordering test: 首发 lifecycle record 提交后才发布 Session tab，并证明配置/catalog 读取不会观察到仅 reserve context 的 Conversation。
