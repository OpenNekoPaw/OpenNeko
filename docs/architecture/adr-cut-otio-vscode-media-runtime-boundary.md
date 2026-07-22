# ADR: Cut OTIO 工程与可替换媒体运行时边界

状态：Accepted（目标架构，尚未实施）
日期：2026-07-22
范围：`neko-cut`、`neko-canvas`、`neko-agent`、`apps/neko-vscode`、`apps/neko-tui`、OTIO 工程、workspace 媒体引用、当前逻辑音频分离与媒体执行。

本文是 Cut 最新目标架构。它补充 [`package-boundaries.md`](package-boundaries.md) 和 [`webview-media-security.md`](webview-media-security.md)，并取代更早文档中的 Cut `.nkv`、专业多轨、隐式活动目标、持续同步、项目内媒体目录和从 Desktop 提案推断出的 Cut 格式结论。

在替换完成前，NKV、现有 Webview timeline store、Extension timeline conversion 和 Rust timeline 仍是代码事实；不得把这些当前实现描述为目标，也不得把本 ADR 描述为已经落地。

Desktop Cut 与未来媒体 adapter 由独立 OpenSpec/ADR 决定。本 ADR 只要求新的 OTIO/Cut Core contract 不依赖当前 Neko Engine，以便未来替换或删除媒体实现时不重写工程模型。

## 决策摘要

1. `.otio` 文件是唯一持久 Cut 工程，可在同一 workspace 内复制、移动、粘贴、另存和复用。
2. Host document session 拥有 OTIO bytes、revision、undo/redo 和文件生命周期；Webview 只拥有可恢复临时状态。
3. 媒体进入 Cut 只采用 workspace-relative link，不复制、ingest 或转码。
4. 初版复用当前 linked audio separation：同源引用、双向 link、分离后避免重复混音；完全独立编辑延期。
5. VS Code 当前媒体能力通过 host-neutral ports 接入；Engine 类型不得进入 OTIO、Cut Core、Agent、TUI 或 Webview contract。
6. TUI 只组合离线 OTIO authoring，不声明 probe、截帧、PCM、preview 或 MP4 export。
7. 不支持的工程、路径和 operation fail-visible，不回退旧实现。
8. 实施必须先删除并验证旧路径；`cleanup-audit.md` gate 通过前不得开发新的 OTIO 生产实现。

## 五层分析

| 层 | 决策 |
| --- | --- |
| 职责 | OTIO 文件是工程事实；Cut Core 拥有 codec/command；Host session 拥有文件生命周期；Webview 只展示。 |
| 依赖 | Cut Core host-neutral；VS Code/TUI 注入 workspace IO；媒体能力通过窄 port 注入。 |
| 接口 | 所有 durable command 携带 document URI/session identity/expected revision；媒体 contract 不含 Engine 类型。 |
| 扩展 | TUI 复用离线 authoring；Desktop 和未来媒体实现单独设计。 |
| 测试 | OTIO/路径/命令用确定性测试，Agent/TUI 验证真实离线 artifact path，VS Code Debug Host 验证媒体/UI。 |

## 1. `.otio` 文件是唯一持久工程

```text
workspace/project.otio
  -> CutDocumentSession
      -> OtioDocument
      -> typed command + expected revision
      -> serialized OTIO bytes
      -> TimelineView
  -> Webview temporary presentation state
```

`CutDocumentSession` 按 document identity 隔离，拥有 dirty state、revision、undo/redo、save、save-as、backup、revert 和外部变更处理。Webview 只提交 command intent，不提供保存时的权威 project snapshot。

selection、playhead、zoom、hover、panel layout、缓存、临时 URL 和媒体 session 均为可恢复状态。Webview 被销毁后，Host 仍必须能够保存和重新打开完整 OTIO。

新 Cut 只创建和打开 `.otio`。不双读/双写 NKC/NKV，不在 OTIO 失败后 fallback。旧文件保持字节不变并返回 unsupported diagnostic。

## 2. 冻结小型 OTIO 子集

只接受 `Timeline.1`、`Stack.1`、`Track.1`、`Clip.2`、`Gap.1`、`ExternalReference.1`、`RationalTime.1` 和 `TimeRange.1`。

顶层 Stack 包含且只包含一个 Video Track 与零到多个 Audio Track。Track 只含 Clip/Gap，Clip 只含一个可用 ExternalReference。nested Stack、Transition、Effect、TimeWarp、Marker、第二 Video Track、多个 media reference 或未知 schema version 在 mutation 前返回 object/path diagnostic。

OpenNeko metadata 只保存：

- project profile、`30/1` edit rate、width/height；
- 每个 Clip 的稳定 `clipId`；
- 当前 separation 所需的 `linkedAudioClipId` / `linkedVideoClipId`；
- audio gain/mute/fade。

link identity 服务当前 separate/unseparate 和避免重复混音，不承诺完全独立音视频编辑。未知 OpenNeko 字段直接拒绝。

## 3. 媒体入口是 workspace link-only

```text
linkMedia(workspaceRelativePath)
  -> Host containment + symlink check
  -> ExternalReference(target_url = workspaceRelativePath)
```

本次不建设 media import/ingest/copy。ExternalReference 以 workspace root 为解析基准，可引用 Cut 项目目录外、同一 workspace 内的文件；禁止 absolute path、file/Webview/localhost/blob URL、runtime token、临时路径和解析后逃逸 workspace 的 symlink。

`cut.defaultProjectRoot` 只决定新 `.otio` 的默认保存位置，不写入工程，不成为媒体引用基准，也不要求 `media/`、`exports/` 或 derived 目录。

同一 workspace 内复制、移动或另存 `.otio` 后，引用语义不变。跨 workspace 缺失媒体时保留工程结构并返回 missing-media diagnostic；用户通过显式 relink 修复。

## 4. Cut Core 与媒体校验分离

Cut Core 实现 create/open/save projection、link/relink、split、trim、reorder、ripple delete、Gap、audio gain/mute/fade、undo/redo 和 revision。OTIO schema、path grammar 与 command invariants 可离线验证。

codec、duration、stream、frame、PCM 和 export 只在对应媒体操作发生时由选定 adapter 验证。Host 未组合媒体 adapter 时，结构编辑保持可用，媒体请求返回 `media-runtime-unavailable`。

## 5. 初版保留当前 linked audio separation

用户显式执行“分离音频”时，当前 VS Code media adapter 先检查源音频；Cut Core 再用一个 command 创建引用同一 ExternalReference、复制当前 ranges 的 Audio Clip，并写入双向稳定 link identity。

该操作不转码，不创建 WAV、staging、媒体副本或派生任务，也不修改源文件。

分离前，Video Clip 可保留当前实现中的内嵌音频播放。分离后，adapter 通过 link identity 避免 Video Clip 和显式 Audio Clip 重复混音。unseparate 删除 linked Audio Clip 并清理 link metadata。

当前 move/trim/delete/undo 的 linked 行为可以保留；provenance-only identity、完全独立编辑和多音频流选择属于后续 change。

## 6. 媒体执行通过可替换 ports 接入

共享 contract 只定义 `MediaProbePort`、`FrameCapturePort`、`VideoPreviewPort`、`AudioPcmStreamPort` 和 `ExportJobPort`。

VS Code 当前 adapter 内部复用 Neko Engine probe、preview、PCM 和 export，但 Engine request、token、timeline DTO、native handle 和生命周期不得越过 adapter。媒体失败返回选定 adapter 的明确 diagnostic，不回退 NKV、Webview timeline 或隐藏实现。

未来替换或删除 Neko Engine 时，应由独立 change 实现新的唯一 adapter，再垂直删除当前 adapter。FFmpeg 或其他后端只执行 typed media operation，不能直接解释 OTIO 或成为第二个 timeline owner。

## 7. TUI 只支持离线 OTIO authoring

TUI 复用生产 Cut Core/document binding，支持：

- create/open/save/save-as 与 OTIO structure import/export；
- workspace-relative link/relink；
- add/delete/split/trim/reorder/Gap/audio property commands；
- revision、schema、path 和 legacy rejection。

TUI 的 export 只指序列化 `.otio`。未组合 media adapter 时，probe、separation evidence、frame capture、PCM、preview 和 MP4 render 必须返回 unavailable diagnostic，不得模拟成功。

真实 Agent evaluation 证明 TUI Agent 选择 canonical Cut capability、使用显式 `.otio` URI/revision 并产生可独立验证的 OTIO artifact；它不证明媒体运行时行为。

## 8. Canvas/Agent 使用显式目标

Canvas route 只包含有序 workspace-relative media/gap snapshot。它只能创建新 `.otio` 或追加到显式 document URI + expected revision，不允许 active/recent fallback、隐式覆盖、replace selection 或持续同步。Agent 使用同一 target/approval/revision contract。

## 9. Webview 保留基础界面

Inspector 只显示 Video Clip、linked Audio Clip、Gap 和项目摘要。播放控制条保留开头、上一 project frame、播放/暂停、下一 project frame、结尾、时间码、静音/音量和全屏；时间线工具条保留 link media、split、删除、undo/redo、zoom、fit-all 和 media export。

Minimap、专业/基础切换和 deferred property surface 从组件、state、message、i18n、style 和测试中垂直删除。

## 10. 替换与验证

测试必须 poison NKV/NKC codec、Webview project snapshot save、active/recent target、media copy/import 和隐藏 fallback。只有 Host CutDocumentSession、OTIO command、workspace-relative link 与选定媒体 adapter 被断言命中时才算成功。

替换顺序是架构约束：先在文档中冻结目标，再删除旧生产代码、测试、fixture、注册、依赖和 generated residue；完成 source/dependency/manifest/legacy/unused/user-data 审计并把 `cleanup-audit.md` 标记为 `passed` 后，才开始新的 OTIO codec、document session、Webview 或 Agent/TUI 实现。清理阶段不得用兼容层、placeholder、fallback 或 no-op 保持旧请求成功。

最低证据：

- OTIO parse/serialize、commands、revision、undo/redo、save/reopen/save-as、copy/move 和 legacy bytes unchanged；
- workspace containment、项目外 workspace link、symlink escape 和 missing-media relink；
- Webview state 丢失后保存、多个 document session 隔离和 no-fallback；
- 当前 linked separation 的同源引用、无媒体副本和无重复混音；
- TUI real Agent 的离线 OTIO artifact path，并明确排除媒体行为；
- Extension Development Host 中的 Cut UI、播放、分离、PCM、export、取消和资源释放。

## 后果与权衡

- 工程权威和 UI 状态边界更简单，`.otio` 可在 workspace 内自由复用。
- link-only 不产生自包含项目，跨 workspace 可能需要 relink。
- Video Clip 在分离前仍可播放内嵌音频，linked audio 暂未完全独立。
- TUI 可离线编辑 OTIO，但不能据此宣称媒体可播放或可导出。
- 当前 VS Code 媒体实现仍依赖 Neko Engine，但新的项目与 capability contract 不依赖它。

## 被拒绝的替代方案

- **让 Webview 保存完整工程：** 违反持久事实边界，状态丢失会影响保存。
- **强制复制媒体到项目目录：** 增加重复文件和生命周期，本次只需要 workspace link。
- **点击分离时生成 WAV：** 增加无必要的 job、staging、磁盘和清理。
- **本次同时重做完全独立音视频：** 扩大替换范围；先保留当前 link 行为。
- **让 TUI 模拟媒体结果：** 不能提供真实 runtime evidence，应明确 unavailable。
- **让 FFmpeg/Engine 直接解释 OTIO：** 会形成第二个 timeline owner；必须先由 Cut Core 产生 typed operation。
