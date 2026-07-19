## Why

OpenNeko 需要停止沿“自建专业 NLE”扩张，同时不能退化成只能播放或频繁拉起 FFmpeg 进程的薄壳。对轻量剪辑真正必要的是可复现的时间线编辑、低延迟 GPU 预览、代理/转码、音频完成和稳定导出；自定义 shader、动态插件、复杂合成、通用动画和专业调色则显著放大跨平台、格式兼容和运行态调试成本。

AI 生成视频进一步降低了内建风格化特效、复杂抠像/跟踪、补帧、超分和高级合成的必要性，但 AI 输出具有生成性、扁平化和不可完全复现的特点，不能替代精确 trim、同步、多轨组织、字幕、混音、实时预览和确定性导出。因此需要重新定义 OpenNeko、NKV、OTIO、`neko-engine` 与 AI/专业工具之间的正式边界。

## What Changes

- 将 OpenNeko 定义为“轻量剪辑 + 基础媒体生产 + AI/专业工具编排”，Cut 只保留一个编辑模式，不再维护 basic/professional 双产品面。
- **BREAKING** 将 NKV 收敛为版本化 lightweight editing profile：保留确定性多轨时间线、最多三个并发视觉层、静态布局、normal alpha、标题/字幕、简单转场、固定正向倍速、基础调色、多轨音频和闭合 DSP；删除开放 effect、mask、通用关键帧/time-remap、倒放、复杂 blend/transition、专业调色和动态插件数据。
- 保留 `neko-engine`，并将其收敛为长驻的 FFmpeg/libav GPU-only 媒体运行时，而不是 FFmpeg CLI 起停包装器。实时预览、seek/scrub、A/V clock、revision 热更新和稳定流继续由 Engine 拥有。
- 保留 Engine 生产任务：proxy、transcode、NKV timeline export、audio render/mixdown、waveform、loudness 和 capture；所有任务使用 closed typed profile、进度、取消、原子输出、ResourceRef 和 provenance。
- 所有视频输入路径继续要求硬件解码；不提供、显式启用或隐式回退 CPU 视频解码模式。平台差异收敛为经过真实 fixture 自检的 FFmpeg 硬件后端 profile。
- Preview、capture 和 export 统一消费一个 Canonical RenderPlan，避免 Webview、Rust compositor 和 FFmpeg 任务各自解释时间线。
- OTIO 只作为基础 editorial structure 的交换格式；NKV 仍是唯一可写项目事实。无法无损映射的 OTIO 高级语义必须明确拒绝或经外部处理器 flatten，不得静默丢弃。
- AI 生成/编辑视频被定义为受管 External Processor：输入为显式 ResourceRef/NKV revision，输出为不可变新媒体候选，携带 provider/model/version、提示与参数摘要、输入引用、任务事实和 provenance；只有用户显式接受后才能加入项目或替换 clip。
- AI 可以承接风格化、抠像/背景替换、跟踪、补帧、超分、生成式扩展、复杂转场/合成和高级视觉修复，但不得直接成为 NKV renderer、静默改写源素材，或替代基本 proxy/transcode/export/DSP。
- **BREAKING** 从 Engine、Proto、Extension、Webview、Agent capability、命令、类型、i18n 和测试中垂直删除自定义 WGSL、动态 effect/plugin registry、diff、非 normal blend、mask、通用 keyframe/animation/time-remap、复杂 transition、Wheels/Curves/HSL/LUT 以及 legacy fallback。
- 旧 NKV 先进行 capability inspection：可无损映射的项目只在显式保存时升级；包含已删除或未知语义的文件保持字节不变并返回字段级 diagnostic 与 handoff/flatten 选项。

## Capabilities

### New Capabilities

- `lightweight-creative-editing`: 定义 OpenNeko 单一轻剪辑体验、NKV lightweight profile、OTIO 交换、旧项目迁移以及 Webview/authoring 的保留与删除范围。
- `lightweight-media-engine`: 定义长驻 GPU-only 实时平面、受管媒体任务平面、Canonical RenderPlan、资源优先级、安全边界和被删除能力的闭合性。
- `managed-generative-media-handoff`: 定义 AI/专业处理器的能力分类、授权调用、不可变候选素材、provenance、显式接受和失败边界。

### Modified Capabilities

无。稳定 spec 目录当前没有覆盖 Cut/Engine/AI 媒体交接的基线 spec。本变更取代未实施的 `reduce-engine-to-basic-playback` 提案，并收敛其他活跃变更中更宽的媒体能力描述。

## Impact

- Rust Engine：`packages/neko-engine` 的 codec、GPU、audio、kernel、runtime、Host API/HTTP/N-API/CLI、实时 session、compositor 和 media job pipeline。
- 共享契约：`packages/neko-proto`、NKV codec/project types、OTIO adapter、Canonical RenderPlan、`@neko/neko-client` 的 stream/job/resource descriptor。
- Cut 全链路：Extension/Webview/Agent capability、timeline store/operations、preview、proxy/transcode/export、字幕、基础调色和音频 UI；被删除能力需要连同消息、undo、i18n、样式和测试一起清理。
- AI/专业工具：Agent capability routing、External Processor、PathAccessPolicy、approval/sandbox、任务事实、ResourceRef/provenance 和候选素材接受流程。
- 其他消费者：Preview、Canvas、Assets、Tools 的 capture、derived artifact、diff 与媒体交接路径。
- 分发：三平台 FFmpeg/native packaging、VideoToolbox/D3D11VA/VA-API profile、字体、proxy/export profile、启动自检和硬件兼容矩阵。
- 用户数据：NKV 写入版本发生破坏性变化，但不得静默丢弃旧项目或覆盖源媒体；proxy、waveform、AI 输出和导出产物分别按派生缓存或独立 ResourceRef 管理。
- 验证：三平台 GPU decode、实时 seek/revision 更新、后台任务 QoS、preview/export parity、NKV/OTIO round-trip、AI 路由与候选接受、Webview Development Host 和聚焦 Agent Evaluation。
