## Context

Desktop Shell 在第一次窗口快照时已经拥有 Project catalog，但 Agent Home 当前只遍历已经创建的 `DesktopAgentWorkspaceRuntime`。因此持久 Pi catalog 中属于已登记 Project 的会话在冷启动时不可见，直到打开 Project 触发 `attachWorkspace`。

Agent Surface 又把两个独立的准备步骤串行化：renderer 等待 Main `getBootstrap` 后才开始 `lazy()` Agent Webview chunk。Root 挂载后，Host bridge 订阅使用 passive effect，而子级 `ConversationController` 也在 passive effect 中请求 conversation、tab、config 和 Skill snapshot。初始化响应存在订阅尚未建立的丢失窗口。真实用户数据表明最新空白会话已写入 catalog，但没有 Pi leaf 或 turn checkpoint，符合“new conversation 成功、pending send 因 config snapshot 丢失而未消费”的路径。

Workbench display menu 使用 Radix portal。首轮实现已把 semantic class 编入 production renderer bundle，但真实 Electron 仍显示透明表面，证明源码/产物字符串检查不足以验证 portal 的最终 token、层叠与实际窗口 bundle。布局菜单虽然允许空 Main 选择 `chat-main`，却只渲染 `desktop-canvas-not-mounted` placeholder；这与项目打开即进入创作 Canvas 的产品路径不一致。

首轮 pending-send 测试直接向一个固定 `ChatWorkspace` 注入 request，没有经过 tabless composer、新 conversation、Tab runtime reconciliation、空 conversation/Timeline projection 和 visible realm replacement。真实截图中 Host 已投影“执行中”，而用户消息仍为空，说明执行状态和 optimistic message 落在了不同 owner 或 pending request 在 owning message commit 前被清除。

## Goals / Non-Goals

**Goals:**

- 冷启动首个 Shell snapshot 即展示当前 Project catalog 范围内的持久 Agent 会话。
- Agent chunk 与 Host bootstrap 并行，并保证所有初始化请求发出前 Host 订阅已建立。
- 新会话 pending send 穿过完整 tabless → conversation → Tab realm 路径，在精确 Tab/conversation runtime 上可见、只消费一次并进入 Pi turn；缺失 config 或发送失败保持 fail-visible。
- Desktop portal surface 在深浅主题下都有稳定不透明背景、边框和层级，并由 production renderer computed style 证明。
- Project 没有 Main View 时由 Host 打开 canonical Workspace Canvas，不建立 renderer 私有文档事实。
- 项目 Resource Browser 以独立 Main View identity 打开/聚焦/关闭/恢复，不再通过 Resource Dock 展示。

**Non-Goals:**

- 不扫描或恢复已经从 Desktop Project catalog 移除的 workspace。
- 不预先创建 Pi conversation runtime、执行 lease、provider/model runtime 或加载 Skill 来生成 Home 列表。
- 不新增第二份 transcript、conversation metadata 数据库或 renderer 持久事实。
- 不删除旧用户会话、lease 或历史宿主数据。
- 不复制 Canvas document store、Resource Browser state 或 package-owned Root。

## Decisions

### 1. Pi authority 提供只读 catalog reader，Desktop AppHost 提供 workspace scope

`packages/neko-agent-runtime` 增加只读 catalog reader，只投影 `PiConversationCatalogRecord`，不创建 `PiConversationRuntime`、lease、session reader 或 model registry。Desktop 初始化从 Shell state 读取已登记 workspace identity 集合，并在第一个窗口 claim 前将该 scope 注入 Agent AppHost。

`readHomeProjection()` 以 scope 内的持久 catalog 为基础，再用已 attach workspace 的实时 projection/active run 覆盖 attention。这样 Home 与执行 runtime 共享同一 Pi catalog authority，又不靠打开所有 Project 产生重型 runtime。

不选择“启动时 attach 所有 workspace”，因为它会把 Home 列表读取和 Project path/stat、provider/model composition、runtime 生命周期耦合，并加重启动卡顿。不选择复制到 Shell state，因为这会形成第二份可漂移 catalog。

### 2. Agent module preparation 与 bootstrap 并行，adapter identity 仍由 bootstrap 决定

Desktop Agent Surface 在 effect 启动时同时请求 Agent module 和 Main bootstrap，使用同一个 owner identity fence。两者完成后一次性创建 adapter 和 Root；任一失败进入明确 error state。module promise 可以复用浏览器 module cache，但 adapter、connection 和 presentation state 仍是 View scoped。

不引入全局 Agent runtime singleton，也不把 module readiness 当作会话 owner。

### 3. Root 在子组件 passive effects 前建立 Host 订阅

`AgentWebviewRoot` 使用 layout effect 建立 adapter subscription，并在卸载时释放。子级初始化请求仍由 `ConversationController` 拥有，但必须在 subscription 可接收事件之后运行。聚焦测试用同步响应 adapter 证明 `subscribe` 发生在第一次 `send` 之前，避免依赖 IPC 通常较慢的偶然顺序。

pending send 由 controller 按 request identity 绑定到 Host 创建的 conversation，再交给该 conversation 的 Tab runtime。测试必须覆盖 tabless submit、`activeConversation`/`tabState` 顺序、空 `conversationSnapshot`/Timeline frame、config snapshot 和 realm replacement。request 只有在 owning render coordinator 已包含 optimistic user message且 Host `sendMessage` 已接受提交后才可消费；普通 Tab 打开/切换不能清除正在创建的 owning pending request。

### 4. Popover primitive 提供可运行态验证的 semantic surface

`@neko/ui` Popover 使用稳定 semantic class，基础 CSS 明确定义 background-color、opacity、foreground、border、shadow 和 z-index。Desktop 通过现有 Desktop theme token 投影最终不透明颜色，业务菜单只定义内部排版。验收读取 production renderer portal content 的 `getComputedStyle()`，要求 background alpha 为 1、opacity 为 1，且实际加载的 stylesheet/bundle 与本次 package identity 一致。

不在每个业务菜单复制背景，也不依赖消费者 Tailwind content scan 恰好包含 `@neko/ui` 源码。

### 5. Host workbench 默认打开 canonical Workspace Canvas

Project attach/restoration 由 `DesktopShellService` 检查当前 project-owned Main Views。若没有可恢复的 Main owner，Host 通过现有 `openOrFocusMainView()` 创建一个指向 `neko/boards/workspace.nkc` 的 Canvas View，并选择 `chat-main`。Canvas runtime 继续负责缺失 Board 的空文档加载和首次保存；renderer 不创建或写入 `.nkc`。已有 Canvas/Preview/Cut/Resource Browser View 按持久 workbench 恢复，不重复创建默认 View。

空 Main placeholder 从正常 Project 路径移除；缺失 Canvas capability或 Canvas 加载失败显示明确 diagnostic，不回退到伪 Canvas。

### 6. Resource Browser 是 Workbench Main View

项目 Resource Browser 复用现有 `DesktopResourceBrowserSurface` 和 Assets-owned Root，增加 `resource-browser` Main View kind 与稳定 project/workspace owner identity。一级导航的资源入口只构造/聚焦该 View，通过现有 workbench CAS 更新；Main group、Tab、close、focus、split 和恢复继续由通用 Workbench contract 拥有。

Resource Dock 不再是项目 Resource Browser 的成功路径。旧的 dock presentation 只能在 schema 迁移时被拒绝或归一化为隐藏，renderer 不再挂载第二份 Resource Browser Root。

## Risks / Trade-offs

- [全局 catalog 包含历史非 Desktop workspace] → AppHost 必须使用 Shell Project catalog workspace scope 过滤，未知 workspace 不投影到 Home。
- [只读 reader 与 workspace authority 同时打开 SQLite] → 继续使用 WAL/busy timeout，并让 AppHost 明确 dispose reader；测试覆盖多 reader 生命周期。
- [layout effect 在 SSR/test 环境告警] → Agent Root 本来只在 browser/Electron renderer 运行；Vitest jsdom 覆盖订阅顺序和 cleanup。
- [optimistic message 与 Timeline frame 重复] → 继续按稳定 message identity merge；测试断言 canonical Timeline frame 替换/合并而非追加副本。
- [通用 Popover 样式影响其他消费者] → 使用现有 token contract、primitive 聚焦测试和 production computed style，不加入业务菜单专属背景。
- [默认 Workspace Board 尚不存在] → Canvas runtime 只在内存中加载空 Canvas，首次真实保存才创建 canonical 文件，不由 Shell 伪造内容。
- [Resource Browser 从 Dock 迁到 Main 影响恢复] → Workbench parser 显式迁移/拒绝旧 presentation，并用路径级测试证明 renderer 只挂载 Main View Root。

## Migration Plan

1. 先添加 catalog cold-start、Root 订阅顺序、跨 realm pending send、production Popover computed style、默认 Canvas 和 Resource Browser Main View 红测。
2. 增加 Pi catalog reader 与 Desktop 初始化 scope，删除 Home 对“已 attach workspace 才可列出”的隐式路径。
3. 并行 Agent module/bootstrap，并调整 Root 订阅时序。
4. 接入 Popover semantic surface、默认 Workspace Canvas 和 Resource Browser Main View，断开项目 Resource Dock 成功路径。
5. 运行受影响包测试/typecheck/build、Desktop package、quality gates 和真实 Electron 隔离场景。

回滚应整体恢复旧行为；没有持久 schema 或用户数据迁移。任何 catalog 读取失败必须阻止 Agent Home 被描述为成功空列表，并显示 diagnostic。

## Open Questions

无。Home 只展示当前 Desktop Project catalog scope，历史未登记 workspace 保留在 Pi authority 中但不出现在 UI。
