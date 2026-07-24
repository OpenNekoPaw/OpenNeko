# 旧版 Cut Webview 能力保留审计

## 结论

旧版实现混合了两类内容：一类是错误的 NKV/Zustand/Webview 工程所有权，另一类是已经形成组件、交互和测试的剪辑能力。OTIO 替换只应替换前者，不能把后者一起降级为最小展示壳。

目标路径是：复用或适配旧版展示组件、pointer/keyboard/context-menu 生命周期和 Host 后台任务编排；所有持久编辑改为 revisioned `TimelineView` + typed command，文件、媒体与导出任务继续由 Extension Host 持有。

## 2026-07-23 重新审计结论

当前实现并未满足“恢复旧版基础能力、只删除复杂功能”的设计约束。Git 基线在 Webview `components/hooks/stores/services` 下有 137 个文件，当前为 48 个；旧版 Webview/Extension 分别有 27/25 个测试文件，当前为 18/15 个。数量本身不是验收标准，但结合删除清单可以确认：被删除的不只是专业能力，还包括 clipboard、selection、Track operations、timeline drag/drop/scroll、pointer lifecycle、preview playback、save/export 等基础行为及其测试。

修复不能继续按截图逐个补按钮，也不能把旧 writable project store 整体恢复。唯一目标路径是：

1. 恢复旧组件边界、DOM/可访问性、pointer/keyboard/focus/drag-drop 生命周期和基础行为测试。
2. Zustand 只持有 document-scoped `TimelineView` 投影、选择、剪贴板和手势预览；不得成为 OTIO 工程权威。
3. 所有持久修改统一提交显式 `documentUri + sessionId + revision + trackId/clipId` typed intent，由 Host/Core 验证并产生新投影。
4. i18n、主题、错误、日志、Workbench Shell、ContextMenu、属性 primitive、resize、keyboard dispatcher、状态栏和 Agent context 继续走共享入口，不在 Cut 内建立第二套基础设施。
5. 删除范围只包括专业视觉/效果系统、旧 NKV/NKC 权威路径、Webview 文件/媒体 IO、隐式 active/recent target 和未实现的 AI stub。

## 详细能力差距与恢复决定

| 范围 | 旧版已具备 | 当前事实 | 目标决定 |
| --- | --- | --- | --- |
| Clip 选择 | 单选、多选、框选、批量移动 | Zustand 只保存一个 selection union | 恢复 selection slice 的交互语义；批量写入成为一个 Host command |
| Clip 拖拽 | pointer capture、snap、edge auto-scroll、cancel/lost-capture/blur cleanup、兼容轨道高亮 | 只保留简化 pointer move；文件 drop 只接受一个 URI | 恢复原 hook/算法边界；drop 同步提取多个 URI 后串行提交 Host prepare/link |
| Clip trim | 左右手柄、`trimStart`/`trimEnd` 独立、可重新拉长 | 投影仅有 source start/available duration；Inspector 把 `trimEnd` 固定为 0 | 投影 available start/duration，分别计算头尾 trim；duration 只改尾端 |
| Clip 状态 | hidden、mute、lock 的独立视觉和菜单 | 普通缩略图一度统一半透明；仅有音频 mute | OTIO `enabled` 控制整体参与；audio mute 只控制音频；`openneko.cut.locked` 控制可编辑性 |
| Clip 操作 | cut/copy/paste/duplicate/split/trim/mute/hide/delete/分离音频 | 菜单只有 split、mute、分离、删除 | 复用 ContextMenu，恢复基础项；paste/duplicate 分配新 identity，locked 在 Core 拒绝 |
| Track 编辑 | rename、reorder、mute、lock、hide、delete、拖入素材 | 仅 add-media 和局部 mute；没有 Track 菜单 | 恢复 Track header、rename/reorder/context menu；必需 Video Track 不可删除，可选 Track 显式删除 |
| Track 状态 | visible/locked/muted 分离 | 没有完整状态投影 | `enabled` 控制整轨参与，`locked` 只限制编辑，`muted` 只影响音频贡献；Subtitle 不显示 mute |
| Timeline 编辑 | split、ripple delete、duplicate、copy/paste、select all、框选、播放头跟随 | 快捷键缺 copy/paste/select-all；没有自动跟随 | 恢复旧 hook/keyboard dispatcher 语义，所有入口共享 typed callback |
| Timeline 视图 | zoom、fit all、horizontal scroll、Overview、virtual visible range | 有简化 Minimap/zoom，但行为和范围仍有回退 | 保留 OTIO Overview，不恢复旧 NKV Minimap；恢复 scroll/follow/visible-range 交互 |
| Timeline 菜单 | Clip、Track、空白区分层菜单 | 只有 Clip 和简化空白区菜单 | 增加 Track/Gap/空白区 context，按 selection/lock/kind/capacity 禁用无效项 |
| 属性面板 | 复用 property primitives 编辑 timing/speed/audio 等 | 只查找选中 Clip；Project/Track/Gap 上下文缺失，trim 语义丢失 | 继续增强唯一 `PropertyPanel`，不建 `BasicInspector`；补 Project/Track/Clip/Gap 基础 section |
| AI 快速调用 | Timeline action 直接发 `executeAIAction`；remove-silence 可运行，auto-edit/match-music 是 stub | Webview 仍残留 `sendAIAction` helper，但没有调用方和 Host handler | 不恢复旧 handler/stub；复用统一 `AgentContextPayload` 和 `neko.agent.sendContext`，发送显式 OTIO document/revision/selection locator |
| VS Code 状态栏 | 播放、时间/FPS、Track/Clip 数量、导出进度 | 只保留 Host-owned 导出任务状态 | 保留独立导出状态；新增 active Cut document 的只读 session/view/playback projection，active editor 只选择展示对象 |
| 导出 | 配置、预设、进度、取消、后台任务 | Host job registry 基础路径已存在 | 继续复用 Export 子组件和 Host job 生命周期；不得把任务生命周期搬回 Webview |
| i18n | 旧版有分域 bundle，但也有硬编码 | 已接共享 provider，但仍有 `静音`、错误边界、Toast ARIA、文件选择器/diagnostic 硬编码 | UI/ARIA/status 使用共享 bundle；稳定 diagnostic code 与本地化展示分离，禁止 string-match 错误 |
| 主题与图标 | VS Code token、共享 UI primitive | 部分工具条用 `+A`、`+S`、字符剪刀/垃圾桶 | 不改主题色；使用共享 icon、IconButton、Tag、ContextMenu |
| Shell/resize | `CreativeWorkbenchShell`、`ResizeHandle`、`useResizable` | 当前仍接入共享 primitive | 保留为 canonical shell；只调整 slot/布局，不复制 shell 或 resize hook |
| 错误与日志 | shared ErrorBoundary/ErrorHandler/Logger | 基础入口仍在，但局部仍可能硬编码或吞错 | Webview 使用 shared boundary/Toast/logger；Extension 使用 shared Logger/ErrorHandler；非法 contract fail-visible |

## 状态语义必须分离

| 对象 | enabled/hidden | muted | locked |
| --- | --- | --- | --- |
| Video Clip | 禁用画面和内嵌音频，并从 preview/export 排除 | 仅禁用内嵌音频 | 禁止 move/trim/delete/link/property edit |
| Audio Clip | 从 preview/export 排除 | 禁用音频贡献 | 禁止内容编辑 |
| Subtitle Clip | 从 preview/export 排除 | 不适用 | 禁止内容编辑 |
| Video Track | 禁用整轨画面和内嵌音频 | 仅静音该轨所有内嵌音频 | 禁止该轨结构和 Clip 编辑 |
| Audio Track | 禁用整轨 | 静音整轨 | 禁止该轨结构和 Clip 编辑 |
| Subtitle Track | 禁用整轨 | 不适用 | 禁止该轨结构和 Clip 编辑 |

`enabled` 不是 `muted`，`locked` 也不是仅用来禁用按钮的 Webview 状态。三者都必须经过 Codec/Core/Preview/Export 路径测试；只有 disabled 对象使用弱化视觉，正常缩略图保持完整可见。

## 剪贴板与 Track 复制边界

- Clip copy 保存 locator、相对时间偏移和兼容 Track kind；不保存可独立写回的 Project 快照。
- paste/duplicate 由 Host 在目标 revision 上重新解析 locator、检查空间和轨道上限，并一次性分配新 Clip/link identity。
- Track copy/paste 复制可选 Track 及内容；Video Track 因固定一轨不能复制成第二轨。跨文档 paste 在本 change 中 fail-visible，不隐式复制媒体或绕过 workspace 路径规则。
- cut 等价于成功 copy 后的原子 Host 删除；若删除失败，不得伪装为成功或丢失剪贴板证据。

## AI 快速调用边界

“发送到 Agent”是上下文移交，不是 Webview 直接调用模型，也不是恢复旧 NKV Timeline tools。Cut Host 从当前 revision 解析选中的 Clip/Track，构造 `AgentContextPayload(type: 'cut-clip')`，其 data 至少包含 `documentUri`、`sessionId`、`revision`、稳定 `trackId/clipId`、时间范围和只读媒体摘要，然后调用统一 `neko.agent.sendContext`。没有显式目标、selection 已过期或 Agent 未安装时必须给出共享 diagnostic。

旧 `AIActionHandler` 的 `auto-edit`/`match-music` 只是“coming soon”成功外观，继续删除；`remove-silence` 若以后恢复，必须作为 Engine/Cut 拥有的独立 typed operation 另行设计。后续实现 Agent handoff 需要新增或更新聚焦 Evaluation：正例证明统一 context path 和目标 identity，负例证明旧 `executeAIAction`/active-editor fallback 未参与。

## VS Code 状态栏边界

- Export item：继续由 Host task registry 投影，可在编辑器关闭后存在，并导航到 task 的精确 `.otio`。
- Cut document item：只展示当前可见/active Cut session 的播放状态、时间码、FPS、Track/Clip 数量和 dirty/diagnostic 摘要；Webview/Host 事件必须携带 document/session identity。
- `window.activeCustomEditorId` 只选择哪个 document projection 可见，不拥有或改写 session 状态；隐藏一个 editor 不得清空其他 document 或后台 export 状态。
- 状态栏文字、tooltip、command title 走 Extension i18n，实例随 Extension lifecycle 显式 dispose。

## 公共基础设施保留清单

| 能力 | 唯一入口 | Cut 允许拥有的内容 |
| --- | --- | --- |
| i18n | `@neko/shared/i18n/*`、Extension l10n | Cut 的 key 与中英文 bundle |
| 主题/图标/菜单 | VS Code CSS token、`@neko/ui` primitives | Cut 领域 variant、菜单项组合 |
| Shell/resize | `CreativeWorkbenchShell`、`ResizeHandle`、`useResizable`/`usePersistedResize` | Preview/Inspector/Timeline slot 与尺寸约束 |
| 键盘 | `@neko/ui/keyboard` dispatcher | Cut binding 与 when predicate |
| 错误 | shared `WebviewErrorBoundary`、ErrorHandler、Toast | Cut diagnostic code 到本地化消息的 projection |
| 日志 | shared Webview/VS Code logger registry | Cut source/category 与结构化 context |
| 拖拽 | 旧 Timeline pointer/drop hooks + Host prepare/link contract | gesture 临时状态、OTIO locator/intent adapter |
| 状态栏 | shared `StatusBarGroup` | document/export projection 和 command |
| AI 上下文 | shared `AgentContextPayload`、Agent command | OTIO selection projector |

## P0：核心能力，当前 change 完成前必须恢复并验证

| 能力                                        | 旧版证据                                                                 | OTIO 目标                                                                                                               | 必要验收                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| create/open/edit/save/save-as/backup/revert | `videoEditorProvider.save.test.ts`、Custom Editor lifecycle              | `CutDocumentSession` 是唯一工程事实；任何编辑都触发 VS Code dirty，保存原子写 OTIO                                      | edit → dirty → save → 磁盘 bytes 改变 → reopen 投影一致；Webview 重建不丢编辑 |
| 撤销/重做                                   | operation history slice、工具条与快捷键                                  | Host session revisioned undo/redo                                                                                       | 连续命令、undo/redo、save/reopen                                              |
| 音视频/字幕文件链接                         | `useTimelineDragDrop`、文件选择器、subtitle import 路径                  | 文件选择器、VS Code Explorer 与系统拖入统一走 Host prepare/link 校验；workspace 外输入先复制到 `.otio` 同目录 `media/` | workspace containment、目标 Track、多个快速 drop 串行、非法类型可见失败       |
| 有界 Track                                  | Track controls/store                                                     | 固定 1 Video、最多 3 Audio、最多 1 Subtitle；空可选 Track 可删除                                                        | 轨道上限、稳定 `trackId`、跨 kind 拒绝                                        |
| Clip 时间放置                               | `TimelineTrack` pointer drag                                             | 主体拖拽按 project frame 落到同类 Track 时间；Gap 规范化；不是仅数组换序                                                | snap、兼容 Track、覆盖拒绝、pointer cancel/lost capture/blur、一次 command    |
| Clip trim/时长                              | 左右 resize handle、`timelineTrimActions` 测试                           | 边缘拖拽和 Inspector 时长共用 typed command，验证源媒体 available range                                                 | 左/右 trim、最小时长、源范围、吸附、保存重开                                  |
| split / ripple delete                       | Timeline actions、context menu、快捷键                                   | Host Core 原子命令                                                                                                      | 播放头 split、ripple Gap 结果、undo/redo                                      |
| 常量速度                                    | `SpeedControl`、`timelineSpeedActions` 测试                              | 仅保留 0.25x–4x `LinearTimeWarp.1`；不保留 reverse/time-remap                                                           | duration/source 映射、preview/export 一致、保存重开                           |
| Clip 音频                                   | PropertyPanel audio、mute、separate/unseparate                           | Video 内嵌音频可静音；Audio gain/mute/fade；分离仍引用原视频且不生成 WAV                                                | 手动双路静音、gain/fade 持久化、分离/取消分离、preview/export                 |
| 连续 Timeline 预览                          | `PreviewPanel.playback.test.tsx`、媒体服务                               | 播放头跨 Clip/Gap/Audio 边界时 Host 切换正确输入；Webview 不只移动红线                                                  | 两个相邻 Clip、Gap、速度、多个音轨、停止与资源释放                            |
| Preview 控制条                              | `PreviewControls` 与布局测试                                             | 开头、逐帧前后、播放/暂停、结尾、时间码、全局音量/静音、全屏                                                            | 控制实际媒体 session 和播放头，不只是 UI 状态                                 |
| 键盘快捷键                                  | `useKeyboardShortcuts` 与输入/IME 测试                                   | Space、逐帧、起止、undo/redo、split、delete 走与按钮相同的 typed intent；输入框与 IME 不接管；`Cmd/Ctrl+S` 留给 VS Code | 可编辑目标、IME、焦点、保存键、命令 dispatch                                  |
| 缩略图/波形                                 | thumbnail/waveform service/hooks                                         | Host/Engine 派生，只读、revision-scoped、失败可见                                                                       | stale result 丢弃、无假波形、Webview 无工作区 IO                              |
| Inspector                                   | `PropertyPanel` 与共享 property primitives                               | Preview 右侧、Timeline 上方；编辑 name、timing/duration、speed、audio/link，source 只读                                 | 每个输入提交 typed command 并可保存；无本地假成功                             |
| 时间线右键菜单                              | Clip `ContextMenu`、`useTimelineContextMenu`                             | Clip/Gap/Track/空白区只显示有效基础操作，与工具条共享回调                                                               | split、trim、delete、mute、separate、link、add/remove Track 的 dispatch 测试  |
| 导出面板与后台任务                          | `ExportPanel`、`ExportConfigView`、`ExportProgressView`、`ExportService` | Webview 只提交配置/订阅状态；Extension Host 持有 enqueue/progress/cancel/query/staging/atomic replace                   | 面板关闭继续、Webview 重建恢复、精确 job cancel、失败不覆盖旧输出             |
| 可调整工作区                                | `CreativeWorkbenchShell`、`ResizeHandle`、`useResizable`                 | 上方 Preview + Inspector，下方 Timeline 全宽；横纵 resize 和折叠状态只存 Webview state                                  | resize/reload、Inspector reveal、最小尺寸、Preview 画幅                       |

## P1：基础生产力，已被用户提升为当前 change 的保留范围

| 能力                                           | 决策                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 多选、框选、批量拖动                           | 保留交互语义；提交一个 Host batch command，不能恢复 Webview writable store                                        |
| cut/copy/paste/duplicate                       | 当前范围内恢复；clipboard 为 Webview 临时 payload，粘贴必须成为 Host command 并生成新稳定 `clipId`                |
| Track rename/reorder/mute/lock/hide/delete     | 当前范围内恢复；状态必须持久化并由 Core 强制，不得用 Webview-only 状态冒充能力                                     |
| zoom、fit-all、水平滚动、Overview、播放头跟随  | 保留；旧 NKV Minimap 实现删除，使用只读 OTIO Overview 替代                                                        |
| export presets、格式/codec、硬件编码提示、队列 | 保留旧面板能力；先保证 MP4 基础导出和后台任务闭环，再开放 Engine 实际支持的其余选项                               |
| AI 快速调用                                    | 恢复为统一 Agent context handoff，不恢复旧 `executeAIAction`、stub 或隐式 active editor                           |
| 状态栏文档状态、导出进度和导航                 | 恢复为 Host 投影，不属于 Webview 工程所有权                                                                       |

## 明确删除或延期

- 删除 NKV/NKC codec、Webview snapshot save、Zustand writable project store、Extension 从 Webview 重建完整工程、隐式 active/recent editor。
- 删除多视觉层、shape、transition、effect、mask、keyframe、color correction、blend、插件、专业模式、AI 自动剪辑 stub 与富文本字幕创作；保留“发送到 Agent”的统一上下文入口。
- 删除 reverse、speed ramp/time-remap；只保留常量速度。
- 不建设素材 copy/ingest、proxy/original、视频音轨到 WAV 派生、自动抽帧/补帧。缩略图/波形仍是只读派生表示。
- Preview quality/FPS overlay/screenshot/PiP 不属于当前 P0；可延期，不能阻塞基础编辑和导出闭环。

## 可复用实现边界

| 旧实现                                                                                 | 处理方式                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ContextMenu`、菜单关闭/定位生命周期                                                   | 直接保留或小幅适配                                                                         |
| `TimelineTrack` pointer capture、cancel/lost-capture/blur cleanup、snap 和 resize 算法 | 抽取为纯交互/数学层，提交 OTIO command；删除直接 Store mutation                            |
| `useTimelineDragDrop` 同步提取 `DataTransfer` 与串行 drop queue                        | 保留；将 `ProjectData`/import/copy 分支替换为 Host link intent                             |
| `PreviewControls`、`TimelineControls` 的基础按钮布局                                   | 裁剪高级按钮后复用，不能再内联到 `App`                                                     |
| PropertyPanel 的 `@neko/ui` property rows/inputs                                       | 复用 primitive；不恢复专业 section 和旧 element DTO                                        |
| `SpeedControl`                                                                         | 仅保留常量速度 presets/number input；删除 reverse/preserve-pitch/time-remap                |
| `ExportPanel`/config/progress                                                          | 保留展示与恢复交互；删除 Webview `ProjectData` 和文件校验，改接 Host job projection        |
| `ExportService` 的 enqueue/poll/cancel/staging 思路                                    | 适配为 OTIO `TimelineView`、显式 document/session/job identity；不得照搬全局/最近 job 猜测 |

## 组件迁移规则

| 既有边界                                                  | 迁移决定                                                                                                            | 禁止的平行实现                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `PreviewPanel`                                            | 保留组件与 media-session/资源释放职责；输入改为 Host preview projection                                             | 新建 Basic Preview 或在 `App` 直接操作媒体 DOM |
| `PreviewControls`                                         | 保留控制条、音量、全屏、焦点与 i18n；仅裁掉本 change 延期的质量/FPS/PiP/截图入口                                    | 在 `App` 内联另一套控制条                      |
| `Timeline` / `TimelineTrack`                              | 保留 ruler、track/clip、pointer capture、trim、snap、scroll/context-menu 组件边界；Store mutation 改为 typed intent | 以静态条带或 reorder-only 新时间线替换         |
| `PropertyPanel`                                           | 保留右侧面板边界和共享 property primitives；只组合 Project/Track/Clip/Gap 基础 section                              | 新建 `BasicInspector` 与旧 PropertyPanel 并存  |
| `ExportPanel` / `ExportConfigView` / `ExportProgressView` | 保留配置、任务和进度子视图；任务 owner 改为 Extension Host                                                          | 单文件最小弹窗替代旧导出工作流                 |
| `useKeyboardShortcuts` / timeline hooks                   | 保留共享 keyboard dispatcher、输入/IME/focus 与 pointer/drop cleanup；替换 Store closure                            | 新增只覆盖少数按钮且丢失旧边界语义的平行 hook  |

公共基础设施不是清理目标：`@neko/ui`、共享 i18n provider/bundles、VS Code theme tokens、Toast/ErrorBoundary、Extension Logger/ErrorHandler/StatusBarGroup 必须继续作为唯一入口。某个专业功能被删除时，只删除其领域 section、message 和 handler，不删除基础 runtime 再局部重造。

## 测试基线判断

- 旧版存在 27 个 Webview 测试文件和 25 个 Extension 测试文件，覆盖 pointer lifecycle、trim/speed/duplicate、快捷键、预览播放、保存、导出与预设等行为。
- 当前有 18 个 Webview 测试文件和 15 个 Extension 测试文件，但仍缺 clipboard/selection、Track operations、旧 pointer lifecycle、preview playback、save/export 等关键行为覆盖。`App.layout.test.ts` 主要检查源码字符串，不能证明交互或 Host side effect。
- 因此当前状态是“编译与局部纯函数测试通过，功能验收未通过”。在保存、拖拽、跨 Clip 播放、Inspector、context menu、后台导出和 Dev Host 场景通过前，相关 OpenSpec task 不得标记完成。
