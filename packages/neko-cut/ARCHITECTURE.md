# neko-cut 架构

## 权威与职责

```text
.otio bytes
  -> CutDocumentSession (revision / dirty / undo / save lifecycle)
     -> OTIO codec + typed Cut commands
     -> TimelineView
        -> Webview temporary presentation state

TimelineView + resolved workspace media
  -> host-neutral media ports
     -> VS Code NekoEngineCutMediaAdapter
```

- `@neko-cut/domain` 只定义受限 OTIO subset、OpenNeko metadata、命令、投影、会话和媒体 port，不导入 VS Code、React 或 Engine 实现。
- Extension Host 拥有 workspace IO、`.otio`-relative 路径解析与 containment、Custom Editor 生命周期、Canvas 显式交接和媒体 adapter。
- Webview 只消费 revisioned `TimelineView` 并发送 command intent；不得保存或回传完整工程快照。
- Neko Engine request、job ID、播放 handle 与内部 timeline DTO 保持在 adapter 内部。

## OTIO subset

只接受 `Timeline.1`、`Stack.1`、`Track.1`、`Clip.2`、`Gap.1`、`ExternalReference.1`、`RationalTime.1` 和 `TimeRange.1`。顶层最多 5 个轨道：恰有一个 Video Track、最多三个 Audio Track、最多一个 Subtitle Track；未知 schema、超限轨道、非空 effects/markers、非法 OpenNeko metadata、重复 Track/Clip ID 或非双向链接均返回 object/path diagnostic。

OpenNeko metadata 仅持久化工程 profile、稳定 `trackId`/`clipId`、分离音频的双向 link identity，以及 Clip 的 gain/mute/fade。所有目标轨道命令按 `trackId` 定位；同类轨道可拖拽移动，跨类型移动 fail-visible。第三方 metadata 原样保留。

## 路径与媒体

持久化路径唯一形式是相对 `.otio` 所在目录的 POSIX `target_url`。Host 对 workspace 内媒体原地链接；对显式选择或拖入的 workspace 外媒体先原子复制到 `.otio` 同目录的 `media/`，再走同一 containment/probe/link path。解析、另存和 Canvas 交接继续执行 workspace 与 symlink containment；运行时才投影为 workspace-relative source。`cut.defaultProjectRoot` 只决定新工程位置。

显式分离音频复用同一个 ExternalReference 和 source range，不创建 WAV、staging 或派生任务。Video Clip 与 Audio Clip 的静音状态完全由用户控制。

导出只支持 workspace 内 MP4。Adapter 先写 staging，验证输出后原子替换目标；失败或取消会删除 staging 并保留既有目标。

## UI

基础界面包含播放控制条、保持项目画幅的预览舞台、上下文 Inspector、添加音频/字幕轨道、向指定轨道链接媒体、Clip 拖拽、split、delete、undo/redo、zoom、fit-all、导出、可水平滚动时间线和只读 OTIO Timeline Overview。项目 Inspector 将电视、电影、短视频和方形预设映射为 OTIO profile 的具体宽高；Preview 先把源帧等比放入项目画布，再把项目画布等比放入当前容器，后台导出读取同一 profile。右侧只显示当前选择所需属性；没有专业模式与旧 NKV Minimap。Overview 仅投影 `TimelineView` 和 viewport，不拥有 writable store、媒体 IO 或 command。Subtitle Track 初版链接 SRT/VTT 并参与排列；当前 adapter 尚不叠加预览或烧录，非空字幕轨导出会明确拒绝。

## 验证

- Domain：OTIO round-trip/diagnostic、identity/link graph、命令代数、session/revision。
- Extension：document-relative path/rebase、workspace containment、Engine probe/preview/PCM/export 生命周期、`.otio` 注册。
- Webview：只读投影边界、基础布局/控制与已删除能力 absence guard。
- 运行态：Extension Development Host + Webview CDP 场景。
