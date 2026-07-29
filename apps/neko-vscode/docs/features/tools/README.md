# Neko Tools

> 通用工具：图片/视频/音频 Diff 比较、媒体信息查看

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host + Webview (React Diff UI) 双进程

## Quick Reference

- **职责**：媒体文件 Diff 比较（侧边/叠加/滑动）、媒体元数据查看
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`contracts/`（L0 消息契约）、`extension/`（Host）、`webview/`（React Diff UI）
- **依赖**：`@neko/media`、`@neko/shared`
- **被依赖**：neko-cut、neko-canvas、neko-agent（extensionDependency）

## Architecture

```
用户右键选择两个媒体文件
  │
  ▼
Extension Host
  ├── MediaDiffEditorProvider → CustomEditorProvider
  ├── MediaDiffService        → 图片/音频/视频直接分派
  └── @neko/media/node        → 可取消 FFmpeg/ffprobe
        │ postMessage
        ▼
Webview (React)
  ├── DiffViewer          → 三种比较模式
  │   ├── side-by-side    → 左右并排
  │   ├── overlay         → 叠加透明度
  │   └── slider          → 拖拽分割线
  └── MediaInfo 面板      → 编码/分辨率/帧率/码率...
```

### 支持格式

| 类型 | 格式                          |
| ---- | ----------------------------- |
| 图片 | PNG、JPG、GIF、WebP、BMP、SVG |
| 视频 | MP4、MOV、AVI、MKV、WebM、M4V |
| 音频 | MP3、WAV、OGG、FLAC、AAC、M4A |

### 横切关注点

- **Logger**：Extension 入口通过 `createVSCodeLogger('Neko Tools', ...)` 初始化，输出到 VSCode OutputChannel。内部模块通过 `getLogger(source)` 获取子 logger。
- **i18n**：Webview 使用 `@neko/shared` 的 `I18nService` + `I18nProvider`。翻译文件位于 `webview/src/i18n/locales/`（en + zh-cn），命名空间 `mediaDiff`。
- **错误边界**：Webview 入口已包裹 `ErrorBoundary`。
- **协议**：所有请求和响应都携带显式 `sessionId`、`requestId` 与 schema version；陈旧或未知消息直接失败。
- **范围**：只支持图片、音频和视频比较；NKV/JVI 与 Timeline Diff 已退出。
