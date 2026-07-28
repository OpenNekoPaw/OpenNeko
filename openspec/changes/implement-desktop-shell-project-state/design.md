## Context

P1.1 已提供 application/window identity、fixed bridge、Electron Host ports 与安全 renderer。
现有 `@neko/shared` 已拥有 `.neko/workspace.json`、全局 workspace registry 和 Node SQLite
local metadata store；Agent 已验证 snapshot-first projection attachment；`@neko/ui` 已提供
Tabs、Button、IconButton、Tooltip、ScrollArea 与工作台原语。

本变更不复制这些能力，也不把 Desktop Shell 提升为领域事实 owner。

## Goals / Non-Goals

**Goals:**

- 建立 Home 与 Content Project 的真实 Shell/navigation authority。
- 保证 Project、Workspace、Window、Tab、View 和 attachment identity 不混用。
- 让 catalog/window state 通过 Host CAS 持久化，并在 reload/restart 后恢复。
- 让跨窗口 projection 按 owner 更新，拒绝陈旧 revision、epoch 和 response。
- 为后续领域 Root 提供明确 slot，不用 mock/no-op surface 冒充接入。

**Non-Goals:**

- 接入 Agent、Assets、Canvas、Cut、Preview、Generation 或 Chara runtime。
- 创建 CharacterProject/Version 或 WorldProject/Run。
- 建立通用 Desktop store、Task manager、domain registry 或 arbitrary IPC。
- 把绝对路径、credential、Electron object 或 Host service 暴露给 renderer。
- 声明 Desktop 已成为受支持产品。

## Five-Layer Analysis

| 层 | 设计结论 |
| --- | --- |
| 职责 | Workspace registry 拥有 workspace identity；Desktop Project catalog 只拥有导航 binding；Window state 拥有 tabs/layout；View state只拥有展示状态；领域 facts 留给 owning package。 |
| 依赖 | Renderer 只依赖 browser-safe bridge DTO 与 `@neko/ui`；Main 依赖 `@neko/host`、workspace identity/local metadata public entry；Agent 通过兼容类型复用 Host primitive。 |
| 接口 | 固定 Shell methods、versioned snapshot/event、explicit Window/Tab/View/owner identity、expected revision 和 typed diagnostic。 |
| 扩展 | 后续领域以 owner-keyed projection slot 接入；不修改 Shell catalog schema来承载领域 facts。 |
| 测试 | parser、CAS、duplicate open、跨窗口、stale revision/epoch、reload/restart、profile rejection、architecture imports 与 packaged Electron smoke 分层验证。 |

## Decisions

### 1. Catalog reuses canonical workspace identity

打开 Content workspace 时，Host 先通过 `resolveNodeWorkspaceIdentity()` 读取或创建
`.neko/workspace.json`，并更新现有全局 workspace registry。Project record 使用稳定、
显式且不同语义的 `projectId = content:<workspaceId>`。

Host-only record 保存：

```text
projectId
workspaceId
profile = content
displayName
workspacePath
workspaceLocator
createdAt
updatedAt
```

Renderer projection 删除 `workspacePath` 和 portable locator，只保留导航 identity 与
display metadata。重复打开相同 Workspace 聚焦现有 Project Tab，不生成第二个 Project 或
Workspace identity。

### 2. One CAS state file, separate owner revisions

Desktop Shell user-local state使用一个 versioned JSON document和原子 rename，包含：

- storage revision：跨进程/实例 CAS；
- catalog revision：Project metadata projection；
- stable primary WindowId 与各 Window layout；
- per-window revision、active target 和 Project Tabs；
- per-view epoch 与允许持久化的 presentation state。

每个 mutation 同时携带 expected Window revision。Host 在写前重新读取 storage revision；
不匹配时返回 `desktop-shell-stale-revision`，不做 last-write-wins。状态解析失败、未知版本、
缺失 identity 或非法 active target 直接 fail-visible。

### 3. Projection attachment is owner-neutral

`@neko/host/projection-attachment` 只定义：

- endpoint epoch + attachment id；
- snapshot/ack/patch/detach envelope；
- sequence/base/projection revision；
- fatal diagnostic codes 与 identity comparison helper。

Agent 的 `ProjectionAttachmentKey(tabId, conversationId)` 继续存在，并以类型别名组合通用
envelope；Desktop 使用 `WindowId/ViewId/ViewEpoch/Owner` key。公共 primitive 不知道
Conversation、Project 或任意领域 patch。

### 4. Shell bridge remains purpose-scoped

P1.2 增加固定 API：

```text
shell.getSnapshot()
shell.subscribe()
projects.openContent()
projects.requestProfile(profile)
tabs.activateHome(expectedWindowRevision)
tabs.activate(tabId, expectedWindowRevision)
tabs.close(tabId, expectedWindowRevision)
```

`openContent()` 由 Main 显示 directory picker；renderer 不提交路径。每个 IPC handler
继续通过真实 sender/frame/window registry 解析 WindowId。

### 5. Shell renders honest capability state

Home 固定且不可关闭。Content Project 提供 project navigation、surface slot 与 Context Dock。
P1.3-P1.6 尚未接入的 surface 显示 owning slice 与 unavailable diagnostic，不返回交互成功。
Character/World request 只返回 diagnostic，不写 catalog、不创建 Tab。

### 6. Quit drains Window owners before AppHost disposal

Electron `before-quit` 先关闭仍存活的 BrowserWindow，并等待每个 Window 完成
`window-closing -> closed -> per-window disposable release`。只有 Window registry 清空后，
才释放 IPC、production protocol 和 AppHost-owned Shell/local metadata resources，最后允许
第二次 `app.quit()` 完成退出。

退出路径不得先 `disposeAll()` 再让仍存活的 BrowserWindow 触发 `close`；否则 close
lifecycle 会引用已释放的 Window identity。重复退出请求只等待同一 shutdown，不并行释放
资源，也不通过忽略 unknown/disposed Window 掩盖顺序错误。

每个 Window 还拥有一次 main-owned renderer recovery budget。首次非 shutdown
`render-process-gone` 记录 diagnostic 后由 BrowserWindow reload，沿正常
`renderer-loading -> renderer-ready -> snapshot` 路径推进 endpoint epoch；同一 Window
再次崩溃时返回明确 exhausted diagnostic，不无限 reload，也不回退旧 renderer state。

## Risks / Trade-offs

- Desktop 启动 Node SQLite local metadata 增加 native/runtime 生命周期；AppHost 必须在 quit
  前显式 dispose。
- JSON Shell state 是 user-local navigation metadata，不是可移植项目事实；未来多进程窗口
  仍需保留文件 CAS，不可退化为内存 singleton。
- P1.2 Shell 视觉可运行但领域 slot 仍 unavailable；文档与 UI 必须避免将其描述为功能接入。
- Agent 类型迁移必须保持现有 producer/consumer API 与测试，不允许复制第二套协议。
