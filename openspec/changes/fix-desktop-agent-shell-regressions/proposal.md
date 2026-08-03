## Why

Electron Desktop 的 Agent 入口在冷启动、首次挂载和项目主面板状态下出现一组相互放大的回归：最近会话延迟出现、Agent 初始化串行卡顿、portal 组件透明、会话事件未进入可见 Tab，以及 Chat + Main 布局不可选。首轮修复只证明了样式源码、固定 Tab 和空 Main placeholder 的局部契约，真实 Electron 截图仍显示透明 Popover、空白执行中会话和 `desktop-canvas-not-mounted`。这些问题破坏了 Desktop 唯一宿主的核心会话与创作路径，需要以运行态 computed style、跨 realm 会话投影和真实 Main View owner 一次性恢复。

## What Changes

- 让 Desktop Agent Home 在窗口首次快照前读取所有已登记 Project workspace 的持久会话目录，不再依赖某个 Project 已经打开或 Agent runtime 已经 attach。
- 让 renderer 启动门禁预加载 Agent UI chunk，具体 Project/View bootstrap 仍按 owner 在
  Agent Surface 挂载时请求，并保证 Host 事件订阅先于子组件发出的初始化请求。
- 为 Desktop portal surface 提供由 `@neko/ui` primitive 和 Desktop theme contract 共同拥有的稳定、不透明背景，并在生产 renderer 的 portal DOM 上验证最终 computed style。
- 保证创建、恢复和发送会话时，tabless pending send、Tab state、optimistic user message 与 authoritative Timeline projection 按显式 conversation identity 进入同一可见 runtime；pending send 只能在 owning conversation 已持久接收消息后消费。
- Project 首次打开或恢复到没有 Main View 时，由 Host workbench owner 打开 canonical Workspace Canvas `neko/boards/workspace.nkc`；当前会话中用户关闭最后一个 Main Tab 后则显示不含失败 diagnostic 的显式空状态。
- 将项目 Resource Browser 作为独立 Workbench Main View 打开、聚焦、关闭和恢复；一级导航只发出 open/focus intent，不再把 Resource Browser 作为 project dock owner。
- 修复共享 resize primitive 在 React StrictMode effect 重放后误判为已卸载的问题，保证侧边栏、Dock、Main split 与 Timeline 的拖拽提示状态在指针会话结束后清除。
- 修正 Desktop Agent 与 Resource Browser Dock 的主题作用域，使三个 Workbench 主区域统一使用纯白 Main surface；同时消除 Agent 对话区与输入区的分区底色，并去除“资源管理”Dock 内重复的 package 标题栏。
- 精简 Home 应用一级侧栏的品牌 chrome，使标题行只显示可交互的 `OpenNeko` 文字且不再渲染品牌或折叠图标；同时让右侧 Agent 创作入口在可用主区域中居中展示。
- 收敛 Home Agent 入口标题 chrome，移除标题前重复的 Agent 图标，并让标题与副标题共享居中文本轴；任务与模板功能图标继续保留。

## Capabilities

### New Capabilities

- `desktop-agent-shell-reliability`: 定义 Desktop 冷启动 Agent catalog、Agent Root 初始化、会话可见投影、portal 主题表面和 Chat/Main 布局的可靠性要求。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop` Main AppHost、Shell service、preload/renderer Agent adapter、Workbench renderer 与 Desktop CSS。
- `packages/agent/runtime` 的持久 conversation catalog 读取边界。
- `packages/agent/webview` 的 Root 订阅时序和 conversation/tab 投影测试。
- `packages/ui` 的 Popover surface contract、共享 resize lifecycle 与样式测试。
- Desktop theme scope 对 Agent/Assets package Root 的 surface token 投影与 production computed-style 验收。
- Desktop Workbench Main View contract、Canvas/Assets 组合、聚焦测试、真实 Electron 验收和相关架构/状态文档。
