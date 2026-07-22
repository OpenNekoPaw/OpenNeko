## Context

当前 Cut 仍以 NKV、Webview timeline store、Extension-owned timeline conversion 和 Rust timeline 为代码事实。现有“分离音频”会创建一个引用相同视频 `src` 的 Audio element，并以 `linkedAudioId` / `linkedVideoId` 避免重复混音；它不是生成 WAV 的媒体派生流程。

本设计以 `.otio` 文件取代重复工程模型，同时尽量不重做已经工作的媒体行为。对应稳定决策见 [`ADR: Cut OTIO 工程与可替换媒体运行时边界`](../../../docs/architecture/adr-cut-otio-vscode-media-runtime-boundary.md)。本 change 和该 ADR 是 Cut 最新目标；更早 NKV、项目内媒体目录或 Desktop 推断只作为历史/当前实现说明。

## Goals / Non-Goals

**Goals:**

- 让可复制、移动、另存和复用的 `.otio` 文件成为唯一持久 Cut 工程。
- 由 Host document session 拥有 OTIO bytes、revision、undo/redo 和文件生命周期；Webview 只拥有临时交互状态。
- 提供 create/open/save/save-as、workspace link、split、trim、reorder、ripple delete、Gap、基础音频参数、preview 和 export。
- 复用当前同源媒体和 linked audio separation 行为，不生成 WAV 或复制媒体。
- 允许引用 Cut 项目目录外、同一 workspace 内的普通文件。
- 让 VS Code 与 TUI 复用同一个 host-neutral Cut Core；TUI 只组合离线 OTIO authoring。
- 保持 Canvas 与 Cut 独立，只允许显式 `.otio` 目标的快照交接。

**Non-Goals:**

- 媒体 import/ingest/copy、项目私有 `media/`、通用格式转换或 proxy/original 生命周期。
- TUI 媒体 probe、frame capture、PCM、preview 或 MP4 export。
- 在本次替换中重做 provenance-only 音频关系、完全独立音视频编辑或多音频流选择。
- 将 Neko Engine 固化为公共 Cut contract；当前 VS Code adapter 未来可由单独 change 替换。
- 专业 NLE、多视觉层、transition、nested timeline、字幕 authoring、调色、效果、关键帧、变速、插件或开放 DSP graph。
- NKC/NKV 在线迁移、双读或双写。

## Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | `.otio` 文件是工程事实；Cut Core 拥有 codec/commands；Host document session 拥有文件生命周期；Webview 只展示投影。 |
| Dependency | Cut Core 只依赖 host-neutral contract；VS Code/TUI 提供 workspace IO；媒体实现通过窄 port 注入。 |
| Interface | Document commands 携带 document URI、session identity 和 expected revision；媒体 ports 不暴露 Engine 类型。 |
| Extension | TUI 只复用离线 authoring；Desktop 和未来媒体 adapter 需要独立 change。 |
| Testing | OTIO fixtures、document path assertions、TUI real Agent artifact evidence 和 VS Code Development Host 分别证明各自边界。 |

## Decisions

### 1. The `.otio` file is the only durable project authority

```text
workspace/project.otio
  -> Host CutDocumentSession
      -> OtioDocument
      -> typed command + expected revision
      -> serialized OTIO bytes
      -> TimelineView projection
  -> Webview presentation state
```

`CutDocumentSession` 按 document identity 隔离，拥有 OTIO bytes、当前 revision、dirty state、undo/redo、save、save-as、backup、revert 和外部文件变更处理。所有 durable command 必须携带显式 document URI/session identity/expected revision；缺失或陈旧时 fail-visible。

Webview 不保存可回写的 timeline snapshot。selection、playhead、zoom、hover、panel layout、waveform/thumbnail cache、临时 URL 和媒体 session 都是可恢复状态。Webview 只提交 command intent 并消费 revisioned `TimelineView`；VS Code 保存不得向 Webview索取完整工程。

同一个 `.otio` 可在同一 workspace 内复制、移动、粘贴、另存和重新打开。复制不会复制媒体 bytes。

### 2. Cut v1 freezes a small OTIO structural subset

只接受：

- `Timeline.1`、`Stack.1`、`Track.1`；
- `Clip.2`、`Gap.1`、`ExternalReference.1`；
- `RationalTime.1`、`TimeRange.1`。

Timeline 顶层 Stack 包含且只包含一个 `Track(kind=Video)` 与零到多个 `Track(kind=Audio)`。Track 只含 Clip/Gap；Clip 只允许一个可用 ExternalReference。nested Stack、Transition、Effect、TimeWarp、Marker、第二 Video Track、多个 media reference 或未知 schema version 在 mutation 前返回 object/path diagnostic。

OpenNeko metadata 只保留当前实现需要的最小稳定 identity/link 和音频参数：

```text
timeline.metadata.openneko.cut =
  profile | editRateNumerator | editRateDenominator | width | height

clip.metadata.openneko.cut = clipId
video clip metadata.openneko.link = linkedAudioClipId?
audio clip metadata.openneko.link = linkedVideoClipId?
audio track/clip metadata.openneko.audio = gainDb | fadeInSeconds | fadeOutSeconds
```

`clipId` 在 create/link/split 时由 Cut Core 分配并持久化。link identity 只服务当前 separation/unseparation 和避免重复混音；本 change 不承诺音视频完全独立。未知 `openneko` 字段直接拒绝，安全的第三方 metadata 可原样保留。

### 3. Media entry is link-only and workspace-relative

本次没有媒体 import/ingest/copy。唯一入口是：

```text
linkMedia(workspaceRelativePath)
  -> Host containment/symlink check
  -> OTIO ExternalReference(target_url = workspaceRelativePath)
```

ExternalReference 使用规范化、普通的 workspace-relative path，并以 workspace root 为解析基准。它可以指向 Cut 项目目录外的 workspace 文件，但不得是 absolute path、file/Webview/localhost/blob URL、Engine token、临时输出或解析后逃逸 workspace 的 symlink。

`cut.defaultProjectRoot` 只决定新 `.otio` 的默认保存目录。它不进入 OTIO，不成为媒体解析基准，也不要求创建 `media/` 或 `exports/`。

同一 workspace 内移动或复制 `.otio` 不改变媒体引用。跨 workspace 打开时，结构仍可编辑；不存在的引用产生 missing-media diagnostic，并通过显式 relink 修改。离线结构编辑不根据 decoder 成功与否拒绝保存。

### 4. Cut Core owns editing; media validation is operation-scoped

Cut Core 实现 create/open/save projection、link/relink、split、trim、reorder、ripple delete、Gap、audio gain/mute/fade、undo 和 redo。项目 edit rate 固定为正有理数，v1 新项目统一为 `30/1`。

OTIO schema、路径 grammar 和 command invariants 可以离线验证。codec、duration、stream count、frame、PCM 和 export 能力只在相应媒体 operation 被请求时由当前媒体 adapter 验证。缺少 media adapter 时返回 `media-runtime-unavailable`，但不阻止合法 OTIO 结构编辑。

### 5. Separation initially preserves current linked behavior

VS Code 用户显式执行“分离音频”时：

1. 当前媒体 adapter 检查源是否具有可用音频；
2. Cut Core 在 expected document revision 上创建引用同一 ExternalReference 的 Audio Clip；
3. Audio Clip 复制发起时 Video Clip 的 timeline/source range；
4. 两个 Clip 写入稳定 `clipId` 和双向 link metadata；
5. 一个 command 原子修改 OTIO 并记录 undo。

该操作不调用音频转码，不创建 WAV、staging 或派生目录，也不修改媒体文件。分离前，Video Clip 可按当前媒体实现播放内嵌音频；分离后，adapter 通过 link identity 避免 Video Clip 和显式 Audio Clip 重复混音。

unseparate 删除 linked Audio Clip 并清理 link metadata。移动、trim、delete 和 undo 的现行 coupled 行为可以保留；完全独立编辑和 provenance-only identity 属于后续 change。TUI 没有媒体 adapter，因此不在真实 Agent evaluation 中执行或验证 separation。

### 6. Media execution is behind replaceable host-neutral ports

公共 Cut contract 只定义：

- `MediaProbePort`；
- `FrameCapturePort`；
- `VideoPreviewPort`；
- `AudioPcmStreamPort`；
- `ExportJobPort`。

VS Code 当前提供一个 editor/document-scoped adapter，内部复用现有 Neko Engine probe、preview、PCM 和 export。该实现不能把 Engine request、token、timeline DTO 或 native handle 暴露给 Cut Core、OTIO、Agent、TUI 或 Webview contract。

媒体失败返回明确 diagnostic，不回退 NKV、Webview-owned timeline 或另一隐藏实现。未来删除或替换 Neko Engine 时，先通过独立 OpenSpec 实现新的唯一 media adapter，再垂直删除当前 adapter；OTIO 和 Cut Core contract 不随之变化。

### 7. TUI owns offline OTIO authoring only

TUI 组合与 VS Code 相同的 Cut Core 和 workspace document store，但不组合媒体 adapter。它支持：

- create/open/save/save-as 和 OTIO structure import/export；
- link/relink workspace-relative references；
- add/delete/split/trim/reorder/Gap 和 audio property commands；
- revision conflict、schema、path containment 和 legacy rejection。

这里的 export 仅指把 OTIO 结构序列化到 `.otio`，不包括 MP4 render。TUI 不做 probe、separation evidence、截帧、PCM、preview 或媒体 export；这些请求必须返回 unavailable diagnostic，而不是模拟成功。

### 8. Canvas and Cut remain independent

```text
Canvas route
  -> ordered workspace-relative media/gap draft
  -> create new .otio
     OR append to explicit documentUri + expectedRevision
  -> Cut Core command
```

不允许 active/recent Cut fallback。已有目标只支持末尾追加，不支持隐式覆盖、replace selection 或持续同步。profile-external cue/transition/effect 返回 diagnostic。Agent 使用相同 target、approval 和 revision contract。

### 9. Webview keeps one basic editing surface

Inspector 只显示 Video Clip、Audio Clip、Gap 和项目摘要；保留当前 linked separation 状态，不展示专业能力目录。播放控制条只保留开头、上一 project frame、播放/暂停、下一 project frame、结尾、时间码、静音/音量和全屏。时间线工具条只保留 link media、split、删除、undo/redo、zoom、fit-all 和 media export。

Minimap 及其组件、projection、interaction、store state、message、i18n、style 和测试垂直删除。长时间线只使用水平滚动、zoom、fit-all 和 playhead follow。

### 10. Replacement remains vertical and fail-visible

新路径测试 poison NKV/NKC codec、Webview project snapshot save、active/recent target、媒体 copy/import 和隐藏 fallback。只有 Host CutDocumentSession、OTIO command、workspace-relative link 和选定媒体 adapter 被断言命中时才算成功。

旧 NKV/NKC 文件不迁移、不覆盖。被移除 UI、store、operation、message、Extension handler、Agent schema、i18n、CSS 和测试必须垂直删除。

实施顺序是硬约束：目标 contract 只先在 OpenSpec/ADR 中冻结；随后先删除旧生产路径及其成功测试，并通过 `cleanup-audit.md` 的 source/dependency/manifest/unused/legacy/user-data gate。该 gate 未标记 `passed` 前，不得创建 OTIO codec、document session、新 Webview、新 Agent/TUI capability 或其他替代生产代码。清理阶段可以保留有明确 owner 和后续 consumer 的共享 primitive 与当前媒体 adapter seam，但不能用 placeholder、fallback 或 no-op 让旧请求继续成功。

## Migration Plan

1. 只在 OpenSpec/ADR 中冻结目标 subset、ownership、path、linked separation、TUI 和 media-port contract；完成 deletion inventory。
2. 垂直删除 NKV/NKC、Webview project snapshot、Extension reconstruction、import/copy、implicit target、professional/Minimap 路径及其成功测试。
3. 运行清理 source/dependency/manifest/legacy/unused/user-data 检查，并将 `cleanup-audit.md` gate 标记为 `passed`。
4. gate 通过后实现 `OtioDocument`、typed commands、revision、undo/redo、serialization、`TimelineView` 和 Host document session。
5. 实现 workspace link-only 与 `.otio` Custom Editor，再构建新的基础 Webview。
6. 在新 OTIO path 上重新接入保留的 linked separation 语义与当前 selected media adapter。
7. 迁移 Canvas/Agent 到显式 `.otio` target，并为 TUI 组合离线 Cut document binding。
8. 运行 OTIO/路径/多文档、TUI real Agent 和 VS Code Development Host 最终验证。

## Risks / Trade-offs

- Video Clip 在分离前仍可播放内嵌音频，暂不提供“分离前静音”的严格角色模型。
- linked audio 仍可能随 Video Clip 发生现行联动；完全独立编辑延期。
- link-only 不产生自包含项目；跨 workspace 复制可能需要 relink。
- 离线 TUI 可以写入结构合法但运行时不支持的媒体引用；preview/export 时必须 fail-visible。
- 当前 VS Code 媒体 adapter 仍依赖 Neko Engine，但新的公共 contract 不依赖它，后续可单独替换。
