# neko-canvas 架构

## 定位

`neko-canvas` 是 AI 驱动的空间创作工作区。Canvas 只拥有以下事实：

- `.nkc` 中的节点、连接、坐标、尺寸、层级、分组和视口。
- Markdown、媒体、文件、子画布和 Job 的通用展示投影。
- 用户选择、拖拽、连接、复制粘贴、撤销重做和统一 Preview。

Canvas 不拥有 Job queue/session/provider runtime，不拥有 Character 或 World
事实，也不从自由文本推断 Storyboard、分支叙事或可执行状态。

## Canonical Contract

共享契约位于 `@neko/shared`：

```text
CanvasNode
  markdown
  media (image | audio | video)
  group
  job
  file
  canvas-embed

CanvasConnection
  sequence
  reference
  derived-from
```

`group` 是唯一视觉容器，成员关系只由 `container.childIds` 表达。连接不重复
表达成员关系。`job` 只保存 `jobId`、`revision`、状态摘要和稳定输入/输出引用；
取消、重试、恢复和执行进度由 owning Job service 处理。

Character 暂不注册。只有角色领域提供稳定的 CharacterProject/Version 引用、
capability contribution 和跨包契约后，才通过独立变更加入“引用”目录。

## 分层

```text
@neko/shared
  Canvas contract / NKC codec / migration / playback projection
        |
packages/domain
  host-neutral authoring and Workspace Board delivery
        |
packages/extension
  VS Code CustomEditor / workspace IO / authorization / lifecycle
        |
postMessage
        |
packages/webview
  React UI / Zustand state / browser rendering / Preview
```

依赖方向保持单向。Webview 不访问 Node.js、VS Code API 或工作区文件；Extension
不拥有 React 状态；可跨宿主复用的写入逻辑保留在 domain service。

## 添加动作

左侧工具栏添加弹层和画布右键菜单消费同一 action catalog：

```text
创建
  Markdown
  分组

导入
  图片
  音频
  视频

引用
  文件
  子画布
```

Markdown 和 Group 可空创建；图片、音频、视频、文件和子画布必须先由
Extension Host 绑定真实来源，Webview 只消费授权后的 durable source result。
JobCard 不在添加目录中，只能由 owning Job service 携带完整 identity/revision
投影。Canvas 不保留常驻右侧节点库，也不区分 Basic/Professional。

## Agent 与 Job

Agent 通过 Canvas Capability Provider 读取目录和 active context，并调用公共
authoring API 创建或修改可创作的 canonical 节点。通用 Agent authoring 工具
不得创建或派生 JobCard；owning Job service 发布投影时必须携带完整
`jobId`、`revision`、`title` 和 `status`。

Canvas 不提供 Shot/Scene 生成按钮、Canvas-owned generation executor 或旧
Storyboard/Narrative authoring path。AI 执行结果先由 owning service 形成稳定
artifact/ResourceRef，再投影为 Media、Markdown、File 或 Job 输出引用。

## Preview

编辑与预览共用 `neko.canvasEditor` Webview。Preview 由以下通用规则生成：

- Markdown 作为文档单元。
- Media 作为图片、音频或视频单元。
- Group 按 `childIds` 和显式 `sequence` 投影顺序。
- Job、File 和 CanvasEmbed 可展示状态或打开来源，但不成为可播放单元。

Preview 不解析任意 Markdown 生成分支，不根据空间位置猜测顺序，也不提供
Narrative Runtime、Route Storyboard Matrix 或 Project/Model 专用 renderer。

## 保存与迁移

当前格式只接受六节点和三连接。Webview snapshot 进入 Extension 后立即校验
canonical discriminator、基础几何和连接端点；非法消息 fail-visible。

旧 `.nkc` 仅在 codec/load 边界执行一次版本迁移：

- Text/Annotation/Storyboard/NarrativeNote 转为 Markdown。
- Media/GeneratedAsset 转为 Media。
- Scene/Shot/Artboard/Gallery 提取为 Group、Markdown 或 Media。
- Script/Document/Model/Project 转为 File。
- 无法保留的 runtime state 产生 migration diagnostic。

迁移后的保存只写当前版本。renderer、Agent catalog、Preview 和 Extension
message handler 不接受旧 discriminator，也不存在双读、双 renderer 或 fallback。

## Workspace Board

默认 Board 是 `neko/boards/workspace.nkc`。Canvas-owned projector 只写
Markdown、Media、File 和 `derived-from` provenance connection。它不从活动
编辑器、最近文件、会话或目录相似度猜测目标，也不创建 Inbox/Task/Run 视觉
Group。`.nkc` 始终是布局权威。

## 运行边界

- Extension Host：文件 IO、路径授权、CustomEditor 生命周期、资源解析。
- Webview：交互、可恢复 UI 状态、浏览器渲染和授权媒体消费。
- Rust Engine：媒体 probe、capture、stream 和编解码。
- Agent/Job service：AI 调度、provider、任务生命周期和结果事实。

运行时 Webview URI、blob、cache/temp path 和 Engine token 不得写入 `.nkc`。
资源不可用时返回明确 diagnostic，不以空节点、旧 renderer 或 no-op 表示成功。

## 验证

最低验证包括共享 NKC/authoring 测试、Canvas Webview 全量测试、Extension 与
Webview 构建，以及 Extension Development Host 中的目录、创建、连接、Preview、
Group 重排、CSP 和消息验收。
