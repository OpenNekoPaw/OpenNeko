# ADR: Cut HTML Video、Node/FFmpeg 与 PCM 媒体运行时边界

状态：Accepted（Cut 已实施）
日期：2026-07-27
范围：`neko-cut`、`apps/neko-desktop`、Electron Host、`@neko/media`、OTIO、
媒体预览、PCM、派生表示与导出。

本文定义单 Video Track、多 Audio Track、单 Subtitle Track 的轻量 Cut 媒体运行时。
OTIO 工程、host-neutral media ports、原生 HTML media 与 Node/FFmpeg 是唯一当前路径；
应用不管理 MSE、`SourceBuffer` 或视频缓冲窗口。

## 背景

Cut 需要连续播放多 Clip、随机 seek、独立 PCM 混音，以及对不兼容容器和 codec
的明确处理。它不需要专业 NLE 的多层 compositor，也不应拥有浏览器已经实现的
Range 调度、媒体缓存、demux、decoder backpressure 和 GOP 回收。

仓库中的 Preview 和 Canvas 已证明 Electron Renderer 可以在严格 CSP 下消费
`openneko://resource` 的授权媒体 URL。Cut 也已拥有两个重叠的 `<video>` 元素，
能够在当前 Clip 播放时预热下一 Clip。继续维护 MSE 会重复 Chromium 的职责，
并引入整段 fetch、手工 append、buffer window、取消和 EOF 状态机。

## 五层分析

| 层   | 决策                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Cut Core 解释 OTIO；Host 授权文件并运行 FFprobe/FFmpeg；Chromium 管理视频数据面；Webview 只管理双槽预热、切换和 Timeline 同步。 |
| 依赖 | Webview 只接收 opaque OpenNeko resource URL 和 runtime-neutral descriptor，不接收路径、FFmpeg DTO 或视频字节。                  |
| 接口 | 视频 descriptor 只有 URL、MIME、profile、source-time origin 和 Clip duration；PCM 使用独立 descriptor。                         |
| 扩展 | 新 codec 通过 Host preparation profile 加入，但输出仍实现同一个普通 Range 文件契约。                                            |
| 测试 | 单元测试证明 direct path 不启动 FFmpeg，路径测试证明无 MSE/fetch，真实 Webview 验证 CSP、Range、首帧、边界和取消。              |

## 决策

### 1. OTIO 与 Cut Core 是唯一 Timeline 权威

`.otio` 是唯一持久 Cut 工程事实；`CutDocumentSession` 拥有文档 bytes、revision、
undo/redo 和文件生命周期，Webview 只拥有可恢复展示状态。typed command 和
`TimelineView` 由该 session 投影，媒体 runtime 只消费 Cut Core 产生的
source-time mapping：

```text
OTIO document + revision
  -> Cut Core source-time mapping
  -> video / PCM / export plan
  -> Host media adapter
```

FFmpeg、`<video>` 和 AudioContext 不得独立解释完整 OTIO。所有 operation、
generation、session 和 cache entry 必须携带显式 document/session identity；
缺失或陈旧 identity、未知字段、非 canonical shape 和未实现 operation 必须 fail-visible，
不得切换到平行媒体实现、第二套项目事实或隐式 active document。

### 2. 原生 `<video src>` 是唯一 Cut 视频路径

Desktop 使用以下 canonical path：

```text
authorized source or completed prepared file
  -> owner/sender-bound openneko://resource URL
  -> browser HEAD / byte Range requests
  -> muted <video src>
  -> Chromium demux and decode
```

Cut 不为视频调用 `fetch()`，不创建 `MediaSource` 或 `SourceBuffer`，不维护前后向
buffer window，也不把完整文件读入应用内存。Node 只按浏览器请求的 Range 打开
对应文件区间；`Response` stream 自然承接 Node stream backpressure 和浏览器取消。

`<video>` 必须静音。源视频音频和独立 Audio Track 统一进入 PCM path，避免双音频
时钟。

### 3. 直接播放源不经过 FFmpeg

当前直接播放白名单：

| Profile                                     | Host 行为  | Webview 行为         |
| ------------------------------------------- | ---------- | -------------------- |
| H.264/AVC、8-bit、YUV 4:2:0、SDR、MP4/M4V   | 注册原文件 | 原生 Range seek/play |
| 已通过目标 Electron runtime 验证的 VP8 WebM | 注册原文件 | 原生 Range seek/play |

非零 Clip source start 直接进入 descriptor 的 `mediaTimeOriginSeconds`。Chromium
根据容器 sample table 和 Range 请求完成关键帧 pre-roll。Host 不为 compatible
source 建 keyframe index、GOP fragment 或 Clip preview file，也不因非零 seek
启动转码。

`canPlayType()`、扩展名和 Chromium 的最大 codec 能力不能单独扩大产品白名单。
目标 runtime 必须用真实变化帧 fixture 完成资格验证。

### 4. 不兼容输入先完成 Host preparation

策略顺序固定为：

```text
qualified original file
  -> lossless H.264 MP4 remux
  -> hardware-only H.264 SDR conversion
  -> explicit unavailable diagnostic
```

H.264 容器不兼容时，FFmpeg 从可解码随机访问点开始，以 `-c:v copy` 生成有界 MP4。
其他 codec 或不合格 profile 使用目标平台已验证的完整硬件闭包：
`darwin-arm64` 使用 VideoToolbox decode、`scale_vt` 和
`h264_videotoolbox -allow_sw 0`。Windows/Linux 不是 release target，不存在可进入产品的
portable software 或硬件预览闭包。`libx264`、CPU scale、CPU tone-map 和自动 fallback
不属于预览路径。平台参数与错误分类由 `@neko/media/node` 统一拥有，Cut adapter 不维护
平台分支。

prepared output 必须完整、可 seek 且通过文件注册后才能发布 descriptor。它是
session-owned 临时文件，stop/dispose 时删除。该路径接受比 direct source 更高的
准备延迟，避免为少数不兼容输入重新引入第二套视频流控。

### 5. 单轨多 Clip 使用两个 video 槽位

Webview 只保留：

```text
active video: 当前 Clip
standby video: 下一 Clip，提前 load + seek + decode first frame
```

standby readiness 必须包含真实呈现帧证据，不能只依据 metadata 或 `canplay`。
边界 activation 只切换可见槽和 clock ownership，不重新连接或 prime。旧 generation
在新 generation 已发布后释放。

单视频轨不为全部 Clip 建立 video consumer。额外元素会无界占用请求、demuxer、
decoder、GPU surface 和缓存，并让编辑后的过期资源取消复杂化。Host 可以提前做
probe 或 descriptor planning，但同时消费媒体的上限是 active + standby。

同一 Clip 只滚动 PCM generation 时转移已有 video session ownership，不重设
`src`。真正的 Clip/mapping boundary 才准备 standby。

暂停与完整停止是不同的 Host operation。暂停只退休 PCM session，并保留当前
video session、Range registration、`src` 和 decoder；同 Clip seek 直接设置
`video.currentTime`。跨 Clip seek 才准备并提升新的 paused standby。只有 Clip
替换、明确 stop、panel dispose 或 document dispose 才撤销当前 video registration。

### 6. OpenNeko resource handler 是授权与 Range 边界

Desktop exact-resource registry 与统一 handler 必须：

- 使用不可预测 opaque ID，不暴露文件路径或启动 TCP listener；
- registration 绑定 Window/View/session/renderer-epoch/generation 和 `webContentsId`；
- 支持 `HEAD`、`GET`、单 byte range、开放末端 range、`206`、
  `Content-Range`、`Accept-Ranges` 和明确 MIME；
- 允许 Chromium 对同一 registration 重试、重复和并发 Range；
- 只服务已注册文件，stop/dispose 后立即拒绝；
- 将浏览器主动断开识别为正常取消，真实 IO 失败继续 fail-visible；
- 不通过 Base64、普通 `postMessage` 或无界 Blob 传递媒体。

Webview descriptor validation 只接受 `openneko://resource/<opaque-id>`。Cut CSP 的
`media-src` 只增加 exact `openneko://resource` origin，不开放 `localhost`、宽泛
`http:`、`file:` 或 `*`。

### 7. 音频统一为 PCM

活动视频内嵌音频和所有启用 Audio Track 由 Host 混合为 48 kHz stereo float32
PCM。live graph 固定为：

```text
source trim/gain/fade
  -> amix(normalize=0)
  -> stereo downmix
  -> loudnorm(dynamic)
  -> 48 kHz resample
  -> final peak limiter
  -> framed PCM
```

`PcmAudioClient` 使用共享 AudioContext、至少 100 ms 启动预缓冲和有界调度水位。
PCM 是有音频场景的 master clock；Webview 按显式 source-time mapping 校正
`video.currentTime`。旧 generation 使用短 gain ramp 退休。

### 8. FFmpeg 仍拥有派生和导出能力

FFmpeg/FFprobe 继续负责 probe、硬件 preparation、截帧、缩略图、波形、PCM、
字幕提取和导出。系统 FFmpeg 只允许显式开发覆盖；发布使用打包并验证的 runtime。

缩略图和波形是可重建派生数据，不是项目事实。导出使用 frozen OTIO revision，
先写 staging、验证输出，再原子提交；取消或失败不得覆盖已有目标。

### 9. 唯一 composition path

每个 composition root 只有一个 Cut media adapter。不得保留 MSE fallback、
平行媒体 adapter、双 probe、双视频 descriptor 或播放失败后的隐藏转码。未知
profile、非法 URL、缺失硬件能力和 session mismatch 必须 fail-visible。

## 验证要求

- direct H.264/VP8 descriptor 命中原文件，并通过 adapter spy 证明 FFmpeg 未参与成功路径；
- Range endpoint 覆盖 HEAD、开放/闭合 range、重复请求、撤销和浏览器取消；
- remux 使用 `-c:v copy`，硬件转换包含 `-allow_sw 0` 且不含 `libx264`；
- browser client 直接设置 `src`，并通过 spy 证明 `fetch`、`MediaSource` 和
  `SourceBuffer` 未参与成功路径；
- active/standby、same-Clip retain、paused seek、Clip boundary、EOF 和 dispose；
- PCM PTS、预缓冲、峰值、generation handoff 和 A/V drift；
- 真实 Electron Desktop 验证 CSP、Range 请求、变化帧、边界和 console；
- 普通浏览器不能替代 Electron Renderer 运行态验收。

## 后果与权衡

正面：

- 浏览器拥有其擅长的视频流控，应用状态机显著缩小；
- compatible source 零视频预处理、零 Clip 临时文件、零应用级视频字节复制；
- 双槽只表达真实的单轨边界需求；
- Cut、Preview 和 Canvas 可以复用 package-owned descriptor 与媒体 primitive。

代价：

- Chromium 的 Range 粒度和媒体缓存不由 Cut 精确控制；
- 长 GOP seek 仍可能读取较大区间；
- remux/硬件转换必须先完成 seekable file，首次准备延迟更高；
- 产品仍需在每个目标 Electron runtime 验证 codec/profile。

被拒绝：

- MSE/SourceBuffer：重复浏览器职责并引入应用级视频流控；
- 整文件 fetch + Blob：失去 Range 并产生内存峰值；
- 为所有 Clip 建立 video consumer：资源随 Timeline 长度增长；
- 所有输入预转码：破坏 compatible source 的低延迟直接路径；
- WebCodecs 作为普通播放：要求应用拥有 demux、帧调度、色彩和 surface；
- 平行媒体实现或 CPU fallback：形成双事实并隐藏资格失败。

后续跨 Desktop Main、Renderer、Node/FFmpeg、`@neko/media` 和 owning contract 的
非平凡替换仍必须先更新 OpenSpec，再按唯一 canonical path 实施和验收。
