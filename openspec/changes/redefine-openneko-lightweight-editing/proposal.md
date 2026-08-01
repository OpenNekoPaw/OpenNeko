## Why

Electron Desktop Cut 已收敛到 OTIO document authority、Node/FFmpeg media runtime 和 package-owned
renderer，但完整 edit/save/reopen、跨 Clip 预览、Inspector/Timeline productivity、background export
和 Desktop save boundary 仍未全部验收。当前提案只跟踪这些产品能力，不保留旧宿主或 Engine
兼容设计。

## What Changes

- `.otio` 是唯一可写 Cut 工程事实；Main document session 拥有 revision、undo/redo、dirty、
  save、backup、revert 和多文档 identity。
- Cut v1 保留一个 Video Track、最多三个 Audio Track、最多一个 Subtitle Track，以及 link、
  split、trim、place/move、Gap、常量速度、gain/mute/fade、preview 和 export。
- Renderer 只拥有 `TimelineView` 投影与 selection/playhead/layout/gesture 等可恢复 presentation
  state；所有 durable edit 通过 revisioned typed intents 进入 Main。
- 文件选择和系统 drop 进入同一授权、containment、probe、复制和 document-relative link path。
- Preview/PCM/frame/waveform/export 只使用当前 Desktop Node/FFmpeg 与 resource gateway；禁止
  Engine、旧 Host adapter、renderer file IO、active-editor 推断和 fallback。
- 完成 Preview + Inspector + Timeline 的共享组件边界、context menu、pointer/keyboard、clipboard、
  multi-select、overview、save/export 和真实 Electron 场景。

## Capabilities

### New Capabilities

- `lightweight-creative-editing`: OTIO-only Cut document、编辑面、持久化、交互与 export workflow。
- `desktop-cut-media-runtime`: Desktop Main-owned probe、preview、PCM、派生表示和 export execution。

### Modified Capabilities

<!-- None. -->

## Impact

- `apps/neko-desktop` Cut document/view/session、Main/preload/renderer 和 shell status projection。
- `packages/neko-cut` OTIO Domain、Node adapter、renderer components/hooks/store 与 ExportJob。
- `packages/neko-media` Node/FFmpeg、Range/PCM 和资源生命周期。
- 用户 `.otio` 与媒体文件保持字节安全；不提供 NKV 双读、迁移或兼容 fallback。
