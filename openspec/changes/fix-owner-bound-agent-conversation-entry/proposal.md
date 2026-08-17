# Change: 修正 owner-bound Agent 会话入口

## Why

Workspace 内新建 Agent 会话时，Desktop Scene 会先投影同 owner Draft，Renderer 又按 Draft 优先接入 Agent Launch，导致首次消息进入 Entry 专属 `submitDraft`。该契约不承载普通 Conversation 的附件和文件引用，因此首次发送丢失，后续消息切换到 `sendMessage` 后才正常。

## What Changes

- 将 `submitDraft` 的可达边界收窄到 Agent Director / Entry presentation。
- Workspace、Character、Room、World 等 owner 已确定的 Surface 不再接入 Agent Launch Draft adapter。
- owner-bound 新会话由 Agent Conversation owner 创建精确 identity，并从第一条消息起使用 canonical Conversation message path。
- Workspace owner-bound Surface 挂载后立即且幂等创建 Conversation，不保留缺少模型、输入目录与精确 mention authority 的 tabless Draft 空档。
- 增加路径级测试，poison Entry submit 并证明 Workspace 首发仍保留附件、文件引用和精确 owner。

## Impact

- Owning responsibility: `@neko/agent-runtime` 拥有 Conversation 创建、turn 与 owner binding；`@neko/agent-webview` 只提交用户输入；Desktop Main 只做 typed bridge、sender/Scene identity 校验和 composition wiring。
- Affected roles: Agent contracts/runtime/webview、Desktop Main/renderer、Host Scene projection。
- User data: 不修改或迁移既有 transcript、Workspace、附件或文件引用；修复仅影响新会话创建和首次发送路径。
