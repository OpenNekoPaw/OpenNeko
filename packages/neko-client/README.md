# @neko/neko-client

> 流媒体客户端：EngineClient HTTP 调度 + H.264/PCM/fMP4 解码播放

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：纯 ESM 库，零内部依赖，在 Extension Host 和 Webview 两端均可用

## Quick Reference

- **职责**：封装 neko-engine HTTP/WS 通信 + 浏览器端媒体流解码播放
- **包名**：`@neko/neko-client`（目录名 `neko-client`）
- **入口**：`src/index.ts`
- **零内部依赖**：不依赖任何其他 `@neko/*` 包
- **被依赖**：neko-cut（webview）、neko-preview（webview）

## Architecture

```
neko-engine HTTP/WS 服务
  │
  ▼
EngineClient (Extension Host 或 Webview 均可)
  ├── HTTP dispatch    → ActionRequest / ActionResponse
  └── WebSocket 管理   → 流会话生命周期

        │ WebSocket 推流
        ▼
流解码客户端（仅 Webview/Browser）
  ├── H264StreamClient      → WebCodecs VideoDecoder → VideoFrame
  ├── AudioStreamClient     → PCM Float32 → Web Audio API（A/V 主时钟）
  ├── FrameScheduler        → A/V 同步帧调度
  ├── FMP4StreamClient      → fMP4 → MediaSource Extensions（备用管线）
  └── PlaybackPerformanceMonitor → 实时性能指标
```

### 导出的核心 API

| 导出 | 说明 |
|------|------|
| `EngineClient` | HTTP 调度 + WS 流管理 |
| `H264StreamClient` | H.264 WebCodecs 解码器 |
| `AudioStreamClient` | PCM Web Audio 播放器（主时钟） |
| `FrameScheduler` | A/V 同步帧调度器 |
| `FMP4StreamClient` | fMP4 MSE 播放器 |
| `PlaybackPerformanceMonitor` | 性能监控 |
| `detectCapabilities` | 浏览器能力检测 |

### 类型导出

`ActionRequest`、`ActionResponse`、`ProbeResult`、`StreamHandle`、`DiffResult`、`LoudnessAnalysis` 等引擎 API 类型

### 技术栈

WebCodecs API、Web Audio API、MediaSource Extensions、WebSocket
