## Context

Agent 首页在没有打开 Tab 时由 `ConversationController` 拥有 tabless entry composer。角色扮演入口已经把候选选择留在该 owner 中，只有用户确认角色后才由 Host 创建角色会话；生成素材入口却先调用 `newConversation()`，再把 `generate-assets` 选择器投影到新建 `ChatWorkspace`，因此任何取消动作都发生在空 Tab 已创建之后。

本次只调整 Webview 内的 entry intent 和首次 Tab 初始化，不改变 Extension message、conversation identity、媒体 provider 或 Agent runtime。

## Goals / Non-Goals

**Goals:**

- tabless entry composer 在素材类型确认前独占选择器、草稿和媒体默认值。
- 取消选择不产生 conversation、Tab 或 Host 副作用。
- 确认图片、视频或声音后创建且只创建一个普通 conversation Tab。
- 新 Tab 通过显式一次性请求接收所选 session mode，并复用既有模式切换投影选择对应媒体模型。
- 首页已有文本继续作为新 Tab 的初始草稿，不自动发送。

**Non-Goals:**

- 不改变普通 Tab 内的 session mode 切换。
- 不改变角色扮演的确认和 Host handoff。
- 不新增持久化字段、Extension/Webview 协议或媒体生成 operation。
- 不把 tabless entry state 提升到共享包或全局 store。

## Decisions

### 1. 选择阶段留在 tabless entry owner

`generate-assets` 入口和对应发送分支只设置 entry intent 与打开选择器，不调用 `newConversation()`。取消仍由现有 `onEntryPromptMenuChange(null)` 关闭，草稿保持在 `ConversationController`。

备选方案是在取消时删除刚创建的空 Tab；这会引入 create/delete 抖动、历史记录和异步激活竞态，且仍违反“确认后创建”的职责边界，因此不采用。

### 2. 用显式确认回调区分 entry 选择与普通模式切换

`InputArea` 增加可选的 entry generation confirmation callback。tabless controller 提供该回调；普通 `ChatWorkspace` 不提供，继续使用既有 `onSessionModeChange`。这样选择器组件不拥有 Tab 生命周期，Controller 也不需要从一般 session-mode 变化反推用户意图。

### 3. 用一次性 identity-bearing 请求初始化新 Tab mode

确认选择时，Controller 创建带递增 ID 的 initial session-mode request，并与可选 initial input request 一起启动新 conversation。只有当前可见的新 `ChatWorkspace` 消费该请求；它通过既有 `handleSessionModeChange` 更新 Tab-owned runtime state 和媒体模型默认值，然后回执清理请求。

不直接共享 `entrySessionMode` 可变状态，也不依赖 active Tab 全局选择来模拟实例状态。请求 ID 防止 React effect 重放或 Tab retention 导致重复消费。

### 4. 所有未确认入口收敛到同一路径

点击入口和生成素材意图下的发送动作都只打开选择器。只有 confirmation callback 能调用新建 conversation 路径，避免第二条旁路继续复现空 Tab。

## Risks / Trade-offs

- [一次性请求在 Tab 激活或 React effect 重放时重复应用] → 请求携带递增 ID，`ChatWorkspace` 按 ID 去重并显式回执清理。
- [新 Tab 先收到配置快照再收到 mode 请求，或顺序相反] → 配置 hydration 不拥有 session mode；mode 请求复用 Tab runtime 的模式切换投影，两个顺序均保持选择结果。
- [取消后草稿被意外清空] → 只在用户确认并开始创建 conversation 时转移并清空 entry 草稿，取消仅关闭菜单。
- [新增回调被普通 Tab 误用] → 回调保持可选且只由 tabless `ConversationController` 提供；普通 Tab 继续走既有模式切换路径。
