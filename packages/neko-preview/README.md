# Neko Preview

> 轻量媒体预览器，支持音视频播放和文档预览

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host (PreviewService + DocumentProvider) + Webview (React)
- 媒体依赖：neko-engine 提供视频/音频的硬件加速解码；文档读取由 Extension Host 的 Node 服务负责

## Quick Reference

- **职责**：视频/音频文件的轻量预览播放 + 文档预览（PDF/EPUB/CBZ/DOCX）
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`、`@neko/neko-client`
- **按需媒体依赖**：仅打开视频、音频或全景媒体时激活 neko-engine；文档预览不启动 Engine

## Architecture

```
用户双击 .mp4 / .mp3 文件
  │
  ▼
CustomReadonlyEditorProvider
  ├── VideoPreviewProvider  (*.mp4, mov, mkv, webm, avi...)
  ├── AudioPreviewProvider  (*.mp3, wav, flac, aac, ogg...)
  ├── PdfPreviewProvider    (*.pdf)
  ├── EpubPreviewProvider   (*.epub)
  ├── CbzPreviewProvider    (*.cbz)
  └── DocxPreviewProvider   (*.docx)
        │
        ▼
媒体：PreviewService（按需连接 neko-engine）
  ├── probeMedia()          → videos:probe
  ├── startVideoPlayback()  → timelines:stream (H.264 推流)
  ├── seekTo/pause/resume   → timelines:seek/pause/resume
  ├── decodeAudioSegment()  → audios:extract (PCM)
  └── getWaveform()         → audios:waveform
文档：NodeDocumentPreviewServer（Extension Host）
  ├── PDF/CBZ               → 支持 Range 的原始字节读取
  ├── EPUB                  → 带尾斜杠的目录 URL + ZIP entry 读取
  └── DOCX                  → 有界整文件读取
        │
        ▼
Webview (React + Vite)
  ├── VideoPlayer
  │   ├── H264StreamClient (WebSocket → WebCodecs → Canvas)
  │   └── VideoControls (播放/暂停/进度/速度/音量)
  ├── AudioPlayer
  │   ├── Web Audio API (AudioContext → AudioBufferSourceNode)
  │   ├── WaveformCanvas (Canvas 波形可视化，CSS 变量主题适配)
  │   ├── CoverView (封面艺术 / 占位首字母 + 渐变)
  │   ├── LyricsView (歌词视图，后续接入滚动歌词)
  │   └── AudioControls (播放/暂停/跳转/进度/速度/音量/视图切换)
  └── Document Viewers
      ├── PdfViewer (pdfjs-dist, 瀑布流/分页, TextLayer 文本选中)
      ├── EpubViewer (epub.js, 瀑布流/分页, 章节导航)
      ├── CbzViewer (zip.js, 瀑布流/分页, 区域框选)
      └── DocxViewer (docx-preview, 缩放)
```

### 文档预览数据流

```
用户双击 .pdf / .epub / .cbz / .docx 文件
  │
  ▼
DocumentProvider (setupDocumentWebview 统一消息处理)
  ├── Webview sends 'ready'
  ├── Extension restores persisted state → 'document:restoreState'
  ├── Extension sends file URL → 'document:data' { url }
  └── Webview loads & renders document
        │
        ├── 右键菜单 → 「发送内容到 Agent」
        │   → 'document:sendToAi' { text?, imageData?, contentKind, context? }
        │   → Extension builds AgentContextPayload
        │   → neko.agent.sendContext command
        │
        └── 右键菜单 → 「发送文件到 Agent」
            → 'document:sendToAi' { contentKind: 'image', context: { page } }
            → Agent reads file on demand via filePath
```

### 数据流

**视频预览**：`NativeEngine → H.264 NAL (WebSocket) → WebCodecs VideoDecoder → Canvas`

**音频预览**：`NativeEngine → PCM Float32 (postMessage) → Web Audio API → 扬声器`

**文档预览**：`Node Extension Host → loopback HTTP → Webview 文档 renderer`，不经过 Rust Engine。

### 横切关注点

- **i18n**：Webview 使用 `@neko/shared` 的 `I18nService` + `I18nProvider`。翻译文件位于 `webview/src/i18n/locales/`（en + zh-cn），命名空间 `preview`（含 video/audio/document/pdf/epub/cbz/docx 前缀）。
- **错误边界**：Webview 入口已包裹 `ErrorBoundary`。

### 音频播放器

Apple Music 风格的现代化 UI，三视图可切换（封面 / 歌词 / 波形），`--neko-audio-*` CSS 变量从 VSCode 主题派生但做媒体化调整，自动适配 Light/Dark/HC 主题。

后续关注点：

- Engine 元数据扩展：真实封面 + ID3/Vorbis 标签。
- `.lrc` 歌词解析：滚动歌词与定位同步。

## 构建

```bash
pnpm build:neko-preview               # Turborepo 过滤构建

# 手动构建
npm run compile:webview               # Vite 构建 webview
npm run compile:extension             # esbuild 构建 extension
npm run copy:webview                  # 复制产物到 dist/
```
