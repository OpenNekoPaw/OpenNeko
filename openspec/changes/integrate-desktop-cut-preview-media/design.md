## Context

Desktop 的 Window workbench 已提供 Main split、Resource Dock 与底部 Timeline slot，但 Cut 和
Preview 的 production Roots 仍依赖 VS Code transport：

> 2026-08-01 supersession：本 change 中的 `neko-media:`、HTTP upstream proxy、loopback
> gateway 和“Renderer 不接收 localhost”决策已由
> `replace-desktop-media-scheme-with-http-resource-gateway` 取代。当前 canonical path 是
> 统一 `openneko:` scheme 与 Desktop exact-resource registry；下述 2026-07-29
> custom-protocol/HTTP 结果仅作为历史验收事实。

- `CutWebviewRoot` 在 `CutOtioControllerProvider` 内从全局 VS Code facade 取得 bridge；
- `CutHostAdapterSurface` 是固定 preview/track 演示，不读取 OTIO、不能编辑或导出；
- Preview 由多个 VS Code Custom Editor entry 组成，尚无统一的 package-owned Runtime/Root；
- Resource Browser 已投影 ContentLocator 与缩略图 descriptor，但 Canvas/Cut target 尚不可用。

2026-07-29 Desktop 运行态复核补充：

- Preview Root 的 Desktop source 输入已直接增强 package-owned `VideoPlayer`、`AudioPlayer`、
  `PdfViewer`、`DocxViewer`、`EpubViewer`、`CbzViewer` 与 `ModelViewer`，不再由 Desktop
  维护平行 viewer；`fountain` 作为 text viewer 输入处理。
- Resource Browser → Canvas 拖拽已转为 portable ContentLocator drag contract，并通过 owning
  Canvas Host 的 `project-content` intent 在真实 drop position 投影；按钮式 add 与 drag
  仍分别保留路径级测试。
- `.otio` 已由显式 `cut.open` 路由进入 AppHost-owned `CutDocumentSession`，Desktop 挂载完整
  package-owned `CutWebviewRoot` 并通过 runtime bridge 共享同一 Stage/Timeline controller。
  playback/export 与 Desktop 外层 Timeline slot 尚未迁移完成，因此 P1.5 仍不得整体标记完成。
- Desktop Tailwind content audit 发现 package Root 已复用但 Agent/Assets/Cut/Preview utility
  classes 未进入 renderer 构建；扫描范围已补齐，避免“组件存在但样式/工具栏丢失”的假复用。
- Canvas/Cut preload bootstrap 在 React StrictMode 重入时不得把同 owner 的 event cursor
  重置为 0；现在只为新 owner 初始化 cursor，避免合法后续 event 被误判为乱序。
- Cut preview/playback 已由 package-owned `CutPreviewRuntimeController` 组合
  `NodeFfmpegCutMediaAdapter` 与 `CutWorkspaceMediaPaths`；Desktop 不实现第二套播放器或
  转码器。当前 Desktop Main 直接把 Node adapter 的 exact seekable source 或 mixed PCM
  注册到 Window/View/session/renderer-epoch/generation-bound Desktop exact-resource registry。
- 2026-07-29 的 custom-protocol-to-HTTP proxy 失败与后续 HTTP 通过只保留为历史可行性证据。
  当前不再代理 upstream 或启动 TCP listener；同一个 `openneko` handler 直接返回
  Range/PCM `Response` stream。
- 当前真实 Desktop 验收已覆盖 Resource 拖入 Canvas、OTIO 打开完整 Cut Root、Cut 播放，
  以及 MP3、WebM、Fountain、GLB 的 package viewer。ExportJob、显式 add-to-Cut 与 side
  Preview 仍是本提案未完成项，不能据此将 P1.5 整体标记完成。
- 原位于 Cut VS Code extension 的 `CutExportTaskRegistry`、`ExportJobCoordinator`、
  codec/store 与 export request freezer 已提升到 host-neutral `@neko-cut/node`；Desktop 与
  VS Code 现在组合同一 ExportJob owner，Electron 只负责选择工作区内导出目标。

Desktop 是本地 Electron AppHost，不应复制 VS Code Custom Editor、OTIO store、media cache 或
ExportJob。所有文件、流、FFmpeg 与生命周期 effect 必须停留在 Main/owning package；Renderer
只消费 versioned projection 和授权的 opaque descriptor。

## Goals / Non-Goals

**Goals:**

- 完整 Cut Root 通过显式 runtime prop/provider 在 VS Code 与 Desktop 中复用。
- OTIO document/session/revision、Cut command、preview playback 和 ExportJob 保持唯一 authority。
- Cut Stage 与 Timeline 使用同一个 session；多个 Cut 文档可打开，但 Phase 1 一次只渲染一个。
- 建立统一 Preview Root，支持 image/video/audio/document/model 的临时、固定与 side View。
- 让 Resource Browser 显示图片/视频缩略图，并显式投递到 Cut/Preview 目标。
- 用 owner/session/sender-bound descriptor 和 app-lifetime OpenNeko resource capability
  支持 Range、取消和释放，不泄露路径或独立 token 字段。

**Non-Goals:**

- 不把 Cut 与 Canvas 绑定为同一文档；二者只通过显式 locator/source mapping handoff。
- 不同时渲染两个 Cut，不实现无限 editor groups 或任意 Dock tree。
- 不重写 OTIO codec、Cut command、Node/FFmpeg preview/export、Preview viewer 或媒体 cache。
- 不让通用 Preview 覆盖 Canvas/Cut 内嵌 preview，也不在 Renderer 中建立 media server。
- 不在本变更中接入 Generation/Quality、Character runtime 或 World runtime。

## Decisions

### 1. Cut 使用独立 versioned Host runtime

Cut owning package新增 browser-safe contract：

```text
CutHostRuntime
  identity(project/workspace/window/view/viewEpoch/document/session/endpoint)
  getSnapshot / subscribe
  executeCommand(commandId, expectedRevision, CutIntent)
  resolveMedia(descriptor)
  dispose
```

snapshot 包含 OTIO/Cut projection、revision、dirty、playback/export projection 与允许的
presentation state。Cut Stage 和 Timeline 从同一 snapshot/controller 实例读取，不能分别
创建 store。`CutOtioControllerProvider` 改为接受 runtime/bridge；production Root 不再导入
`@neko/shared/vscode` 或读取 window global。

备选方案是让 Desktop 模拟 VS Code `postMessage`。拒绝，因为消息缺少 sender-derived identity、
expected revision 与 session cleanup，并会保留第二条 wire contract。

### 2. Cut 文档多开但只渲染一个 session

每个不同 `.otio` 拥有独立 document/session/revision 和 command idempotency ledger。Window
workbench 只保存 Cut View identity/placement，不保存 OTIO、playhead 或 ExportJob 事实：

- 再次打开同一 document 聚焦已有 View；
- 可打开多个不同 Cut 文档并通过紧凑 switcher 切换；
- Phase 1 只挂载 active Cut Stage/Timeline；
- 隐藏/关闭 View 暂停 preview、释放 decoder/stream，dirty close 走 owning save/discard；
- 不使用 active/recent Cut fallback 接收资源或 Agent 操作。

### 3. Preview 建立 viewer registry 上的统一 Root

Preview package新增 `PreviewHostRuntime` 与 `PreviewRoot`。Root 根据 Host 投影的 content kind
选择现有 image/video/audio/document/model viewer；viewer 接受注入 runtime，而不是直接
`postMessage`。View 模式只有：

- `temporary`：单击资源复用，选择变化可替换；
- `pinned`：显式固定后成为持久 View；
- `side`：显式在侧边打开，占用受控 Main split。

`temporary` Preview 必须保留触发它的 Resource Dock 展示状态，使用户可以连续选择资源、
查看缩略预览并执行 Add-to-Cut；它只替换 Main 中同一项目的临时 Preview，不得把资源来源
面板一并隐藏。`pinned` 与 `side` 仍由显式 View 操作决定布局。

Canvas node 与 Cut clip preview 继续由 owning surface 内嵌。通用 Preview 不默认覆盖主创作区。

### 4. 媒体使用 locator-backed、URL 非持久化的授权 descriptor

projection 只包含 `descriptorId`、revision、content kind、必要的公开 metadata。小型缩略图由
Host 解析为受限 image data URL；播放/文档/model 内容由 owning service 解析
`ContentLocator`，再把 exact resource 或 frozen dependency set 注册到 Desktop app-lifetime
exact-resource registry。package-owned descriptor 同时保留 locator/revision 与短生命周期 URL；
URL 不能成为第二内容身份。Main registry 按实际 Window/View/document session、endpoint epoch
和 generation 注册、撤销 capability，并绑定实际 `webContentsId`，不信任客户端伪造的 sender header。

协议必须支持 Range、MIME、取消、EOF 和 session disposal。URL 不包含绝对路径、`file://`、
cache path、Engine/client token 或 provider secret；只允许 CSP 审计过的 exact
`openneko://resource` origin。未知 descriptor、陈旧 revision、跨 owner generation/sender 和
已释放 session fail-closed。

备选方案是给 Renderer filesystem URL、任意 localhost endpoint 或公共 URL 签发 facade。
拒绝，因为它们会绕过 AppHost containment/cleanup 或形成第二资源 API。

### 5. Resource handoff 始终携带明确目标

Resource Browser 的 `preview` 创建/替换明确 Preview View；`add-to-cut` 必须携带目标 Cut
document/session/expectedRevision 与 resourceId。Assets controller 只投影 intent，Cut authoring
解析 stable ContentLocator、校验类型并执行 owning command。成功后返回新的 Cut snapshot；
取消、unsupported、stale revision 或 target mismatch 保持 Cut 不变并返回 diagnostic。
资源行使用唯一 quick-open 路径：普通可预览内容单击进入 `temporary` Preview，`.otio`
单击进入 package-owned Cut Root，`.nkc` 单击进入 package-owned Canvas Root；底部 icon
仍提供显式重复打开、side open 与跨面板 handoff，不建立 Desktop 自有 viewer/editor。

Canvas 与 Cut 的 handoff 同理使用 locator/revision，不建立“Canvas 绑定 Cut”的隐式关系。

### 6. ExportJob 与媒体资源由 owner 管理

Cut export intent 只创建/控制现有 ExportJob；状态投影回原 Cut session和 Activity summary。
切换 View 不转移 Job owner，关闭 UI 不把后台 Job 伪装为取消。AppHost/Project 关闭时按照 owning
policy 取消或保留可恢复 Job，并释放 preview stream、decoder、MessagePort 与订阅。

### 7. Desktop namespace 固定且按 owner 分离

preload 暴露固定 `cut` 与 `preview` namespaces，不提供通用 command router。Main handler 从
sender registry 派生 Project/Workspace/Window/View/endpoint identity，再校验 document/session、
expected revision、command id 和 descriptor。Cut、Preview、Assets 各自保留 owning contract，
不合并成 Desktop DTO。

### 8. 迁移后演示 Surface 必须失效

`CutHostAdapterSurface` 与 `PreviewHostAdapterSurface` 仅可保留为明确 story/test fixture。
production capability ready 时：

- Desktop 挂载完整 `CutWebviewRoot`/`PreviewRoot`；
- VS Code adapter 也使用相同 runtime；
- architecture/debt guard 禁止 Root 全局 VS Code transport；
- demo/fixed timeline 被 poison，命中即失败，不能 fallback 成功。

## Risks / Trade-offs

- [Cut 现有 message 面广] → 按 snapshot/command、preview、export 三组迁移，但每组只保留一个
  canonical adapter，并用 guard 阻止回流。
- [Preview 当前是多个独立 entry] → 复用 viewer 组件和 registry，不把所有 viewer 状态揉进
  单一 store。
- [运行期 URL 被复制] → registration 绑定 `webContentsId`、exact resource scope、短生命周期、
  日志脱敏与 owner/generation 撤销；增加 CSP/CORS、Range、sender isolation 和生命周期集成测试，
  不在 Renderer 增加 fallback。
- [视频缩略图生成成本] → 由 Host 按 descriptor revision 读取/缓存；列表只延迟解析可见项并在
  unmount 时取消。
- [多个 Cut 文档占用 decoder] → 仅 active session 渲染并持有 preview；其他文档只保留 owner
  snapshot。

## Migration Plan

1. 定义 Cut/Preview contracts、parsers、route coverage 与 debt guards。
2. 让完整 Cut Root/Preview viewers 接受 injected runtime，并迁移 VS Code adapters。
3. 实现 Desktop Cut/Preview Main/preload/AppHost composition 和 OpenNeko resource authorization。
4. 接入 Resource preview/add-to-Cut、Cut View switcher、Main split 与 Timeline。
5. 删除/poison production demo surfaces，完成 package、Node/FFmpeg、VS Code EDH 与 Electron
   fixture 验收后标记 P1.5 ready。

回退只能把 Cut/Preview capability 恢复为明确 unavailable，并释放 session；不得恢复固定
timeline、全局 VS Code wire 或 raw path transport。OTIO、源素材和导出产物不删除。

## Open Questions

无。Phase 1 已冻结“一次渲染一个 Cut、最多两个 Canvas、通用 Preview 临时/固定/side”的范围。
