## Why

OpenNeko Cut 当前同时维护 NKV/NKC、自定义 timeline store、Proto/Rust timeline 和较宽的专业剪辑能力。拟议中的 Desktop 如果继续复制这套结构，会形成 VS Code 与 Desktop 两个宿主、两个媒体 runtime 和多个项目事实来源。

产品目标已经收敛为轻量顺序剪辑：一个视频轨、多音频混音、基础 trim/split/reorder、可靠预览和 MP4 导出。OTIO 足以承担这组 editorial structure；VS Code 可以在过渡期继续使用已工作的 Neko Engine，Desktop 则应使用 WebCodecs/WebAudio 和打包 FFmpeg。两端必须共享同一个 Cut Core、OTIO 工程、操作集合和媒体格式 profile。

## What Changes

- **BREAKING** 将 `.otio` 设为唯一 Cut 持久工程格式；Cut 不再创建或写入 `.nkv`，也不把 timeline 写入 `.nkc`。
- **BREAKING** Cut 只保留一个顺序 Video Track、多个 Audio Track、Clip/Gap、trim/split/reorder/ripple delete、固定正向倍速、gain/mute/fade、undo/redo、preview 和 export。
- **BREAKING** 删除多视觉层、overlay/PIP、title/subtitle track、transition、nested timeline、mask、blend、keyframe、复杂 speed、color/effect/plugin、专业模式和开放 DSP graph 的全链路。
- 定义一个 OTIO subset validator 和最小 `openneko.cut` / `openneko.audio` namespaced metadata；未知或超出 profile 的对象返回 path-level diagnostic。
- **BREAKING** 不建设 NKC/NKV 运行时迁移、双读或双写。旧文件保持字节不变并明确拒绝；未来若存在真实数据需求，只允许独立离线转换器。
- 保留一个共享 Cut Core 和 React UI；VS Code 与 Desktop 只通过小型媒体 port 在 composition root 选择不同 adapter。
- VS Code 暂时保留 Neko Engine 作为媒体 probe/preview/PCM/export adapter，但 Engine 不再拥有项目格式、编辑命令或可见能力，并冻结新增功能。
- Desktop 不依赖 Neko Engine：视频使用 bounded source + MP4 demux + WebCodecs + Canvas/WebGPU，音频使用 Host FFmpeg → PCM f32le → binary WebSocket → WebAudio，导出使用打包 FFmpeg。
- 从现有文档预览服务提取 host-owned token、loopback、Range、stream、撤销和 dispose 内核；媒体只允许闭区间 Range，不通过 IPC/postMessage 传大块二进制。
- 定义两个宿主共同遵守的 Cut v1 Media Profile：MP4/H.264 8-bit yuv420p SDR CFR、最高 1080p、AAC-LC 44.1/48 kHz mono/stereo，以及 WAV PCM 44.1/48 kHz mono/stereo；内部 PCM 和导出统一为 48 kHz。
- Desktop 可以将其他受支持输入显式转换为项目内标准 MP4/WAV；第一阶段不建设 proxy/original relink 或原片回套。
- 第一阶段媒体导出只支持 MP4/H.264/AAC-LC/SDR/yuv420p/1080p；工程保存只支持 OTIO。

## Capabilities

### New Capabilities

- `lightweight-creative-editing`：定义 OTIO 唯一工程、轻量操作集合、legacy 拒绝、共享 Cut Core/UI 和跨宿主一致性。
- `host-adapted-cut-media-runtime`：定义 VS Code Engine adapter、Desktop WebCodecs/Host FFmpeg adapter、受控文件/PCM 数据面、严格媒体 profile 和导出边界。

### Modified Capabilities

无。稳定 spec 目录当前没有覆盖新的 OTIO-only Cut 和双宿主媒体 adapter 边界。本变更原先的 NKV/长期 Engine/三层视觉/AI handoff 设计在实施前被本提案原位替换，不作为历史兼容目标保留。

## Impact

- Cut：`packages/neko-cut` Extension、Webview、timeline store、operations、message、undo、项目 codec、preview 和 export UI。
- 共享边界：OTIO types/codec、Cut Core、`@neko/host` Node resource transport、`@neko/neko-client` PCM/preview descriptors。
- VS Code：Engine 继续作为过渡期 media adapter；现有 Custom Editor、PCM client、CSP 和实例生命周期需要接入新 contract。
- Desktop：新增 Electron composition root、host file/process adapter、WebCodecs 视频路径、FFmpeg PCM 和 export job。
- Preview/Content：文档 Range/EPUB entry 仍归文档领域，只提取第二个真实消费者需要的 transport kernel。
- 用户数据：旧 NKC/NKV Cut 文件不迁移、不覆盖；新编辑器只打开 `.otio`。
- 分发：固定 FFmpeg/FFprobe 二进制、许可清单、平台校验和 Cut v1 codec fixture。
- 验证：OTIO contract、legacy poison、两个宿主真实运行态、Range/PCM、A/V sync、格式拒绝和原子导出。
