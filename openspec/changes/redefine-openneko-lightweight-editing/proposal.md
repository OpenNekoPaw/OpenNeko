## Why

OpenNeko Cut 当前在 NKV/NKC、Webview store、Extension DTO 和 Rust timeline 之间重复维护工程语义，同时保留了超出首版目标的专业剪辑能力。当前应先把 VS Code 收敛为 OTIO-only 基础剪辑器，并优先复用已经可用的 Neko Engine 媒体路径。

现有“分离音频”并不会生成 WAV：它创建一个继续引用原视频文件的逻辑 Audio element，Engine 在预览和导出时直接解码视频容器中的音频流。新设计保留这种低成本实现，但把自动创建改为用户显式操作，并在契约中准确称为“逻辑音频分离”。

## What Changes

- **BREAKING** 将 `.otio` 设为唯一 Cut 持久工程格式；Cut 不再创建或写入 `.nkv`，也不把 timeline 写入 `.nkc`。
- **BREAKING** Cut v1 只保留一个顺序 Video Track、零到多个 Audio Track、Clip/Gap、import、split、trim、reorder、ripple delete、gain/mute/fade、undo/redo、preview 和 export。
- **BREAKING** 删除固定/复杂变速、多视觉层、overlay/PIP、title/subtitle track、transition、nested timeline、mask、blend、keyframe、color/effect/plugin、专业模式和开放 DSP graph 的全链路。
- Cut Core 从 `OtioDocument` 唯一派生 `TimelineView`、`CutPreviewPlan` 和 `CutExportPlan`；Extension 与 Engine 不再各自解释完整工程。
- 导入 MP4 时只创建 Video Clip。Video Track 永远按 video-only segment 执行，视频容器中的音频不会自动进入预览或导出。
- 用户显式点击“分离音频”后创建独立 Audio Clip。该 Clip 与 Video Clip 引用同一个 MP4 `ExternalReference`，Engine 运行时直接解码容器中的唯一受支持音频流；不创建 WAV、不写 `derived/audio/`、不提交音频派生任务。
- Audio Clip 创建时复制 Video Clip 的 timeline/source range；之后独立编辑。可保留来源 Video Clip identity 作为 provenance/UI 状态，但不得形成自动同步、sync lock 或跨轨联动 undo。
- VS Code 继续使用当前 Neko Engine probe、timeline video/audio stream、PCM 和 export 能力；本变更不新增 `AudioExtractionJobPort` 或 FFmpeg 音频转码流程。
- 预览按源 PTS 显示帧，不自动抽帧成新素材或补帧。项目拥有固定 edit rate；导出只使用确定性丢帧/重复帧。
- Cut v1 视频为 MP4/H.264 8-bit yuv420p SDR progressive CFR、最高 1080p；逻辑分离要求容器至多一个受支持的 AAC-LC mono/stereo 音频流。独立导入的音频文件继续限定为 WAV PCM。
- 支持 workspace-relative `cut.defaultProjectRoot`；`.otio` 所在目录是项目锚点，`media/` 和默认 `exports/` 使用相对路径。
- 右侧属性面板保留但收敛为单一上下文 Inspector：删除“基础/专业”切换和灰色占位项，只按 Video Clip、Audio Clip、Gap 或无选择状态展示 v1 信息。
- 播放控制条保留开头/上一帧/播放暂停/下一帧/结尾、时间码、静音/音量和全屏；时间线工具条只保留导入、split、删除、undo/redo、缩放、适应全部内容和导出。
- **BREAKING** Minimap 从 v1 Webview、store、message、style 和测试中删除；长时间线只使用水平滚动、缩放、适应全部内容和 playhead 跟随，不保留灰色入口或隐藏恢复路径。
- Canvas 与 Cut 保持独立。Canvas route 只能创建新 Cut 或追加到带 URI/revision 的指定 `.otio`；不推断 active/recent Cut，不持续同步。
- **BREAKING** 不建设 NKC/NKV 在线迁移、双读或双写。旧文件保持字节不变并明确拒绝。
- Desktop Cut、Desktop media adapter、WebCodecs、Desktop FFmpeg、视频音轨转 WAV、通用格式转换、proxy/original、补帧和专业 NLE 能力均不在本 change 范围。

## Capabilities

### New Capabilities

- `lightweight-creative-editing`：定义 OTIO 唯一工程、基础操作、项目时间模型、显式 Canvas → Cut 目标、legacy 拒绝和共享 Cut Core/UI。
- `vscode-cut-media-runtime`：定义 VS Code Engine adapter、同源容器音频的逻辑分离、preview/export plan、严格媒体 profile 和原子导出边界。

### Modified Capabilities

无。稳定 spec 目录当前没有覆盖新的 OTIO-only Cut 与 VS Code 媒体 adapter 边界。本变更早期版本中的 NKV、跨宿主 Desktop、WAV 派生任务和专业媒体目标在实施前被原位替换，不作为兼容目标保留。

## Impact

- Cut：`packages/neko-cut` Extension、Webview、Custom Editor、timeline store、operations、messages、undo、项目 codec、preview、audio、export UI、Inspector、控制条和 Minimap 路径。
- Engine/client：复用现有从视频容器直接解码音频的 timeline/PCM/export 路径；扩展 probe descriptor 和计划边界，不新增音频转码任务。
- 共享边界：OTIO types/codec、Cut Core、`TimelineView`、`CutPreviewPlan`、`CutExportPlan` 和 `@neko/neko-client` 的媒体 descriptor。
- Canvas/Agent：Cut target、capability schema、approval、revision 和 evaluation 从 `.nkv` 改为显式 `.otio`。
- 用户数据：旧 NKC/NKV Cut 文件不迁移、不覆盖；逻辑分离不会创建或修改媒体文件。
- 验证：OTIO contract、legacy poison、显式逻辑音频分离、同源 MP4 引用、video/audio role isolation、PTS/fps、PCM、Canvas/Agent 指定目标、原子导出和 Extension Development Host 路径证据。
