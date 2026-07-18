# Neko Preview

> 轻量媒体、文档与临时 3D 参考布置器

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host（PreviewService + DocumentProvider + ModelPreviewProvider）+ Webview（React）
- 运行边界：neko-engine 仅为视频、音频和全景媒体提供解码；文档由 Extension Host 读取；3D 参考由独立 Three.js Webview 渲染

## Quick Reference

- **职责**：视频/音频播放、文档预览（PDF/EPUB/CBZ/DOCX），以及形象、动作、机位和 720° 场景的临时 3D 参考布置
- **入口**：`packages/extension/src/extension.ts`
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`、`@neko/neko-client`；`three` 仅属于 `@neko/preview-webview`
- **无模型入口**：命令 `Neko Preview: Open 3D Reference Guide` 打开内置中性素体；内置素体只允许动作和机位参考
- **按需媒体依赖**：仅打开视频、音频或全景媒体时激活 neko-engine；文档和 3D 参考不启动 Engine

### 3D 参考用途

| 用途 | 可用对象 | 输出与限制 |
| --- | --- | --- |
| 形象 | 用户明确加载的模型 | 普通视觉参考；内置 guide preset 技术上禁止进入该路径 |
| 动作 | 声明关节能力的中性素体 | 姿势骨架或深度控制图；静态模型显示不支持状态 |
| 机位 | 模型、素体或环境场景 | 相机画幅和捕获图；修改其它面板项不会重置当前 orbit |
| 720° 场景 | 经 Extension 授权的全景图 | 保留 yaw、pitch、FOV 与环境身份；不转成形象参考 |

内置目录由 Preview 以不可变 ID/version/fingerprint 声明，当前内容均为项目自制的程序化几何，二进制资产增量为 0 B，许可证标记为 `LicenseRef-OpenNeko`。`guide-neutral-mannequin`、blockout props/studio 和中性全景方向网格只用于构图、姿势与空间指示，不是角色形象参考。

### 标准 3D 格式

| 格式 | 入口 | 依赖规则 |
| --- | --- | --- |
| GLB | `.glb` | 单文件；内嵌纹理由 GLTFLoader 转换为当前 Webview 的 `blob:` URL |
| glTF | `.gltf` | 仅加载 Extension 预先枚举并授权的相对 buffer/image |
| OBJ | `.obj` | 仅加载声明的相对 MTL 及其纹理 |
| STL | `.stl` | 单文件 |
| PLY | `.ply` | 单文件 |
| MTL | `.mtl` | 不能独立打开，仅作为 OBJ 声明的依赖 |

远程 URL、绝对依赖、目录穿越、缺失文件和未声明资源会显示诊断并终止加载；不会探测目录、切换外部 Viewer 或回退 Engine。

## Architecture

```
用户双击 .mp4 / .mp3 文件
  │
  ▼
CustomReadonlyEditorProvider
  ├── ModelPreviewProvider  (*.glb, gltf, obj, stl, ply)
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
  ├── 3D Reference（独立 model.html 入口）
  │   ├── GLTF/OBJ/MTL/STL/PLY loaders（Three.js）
  │   ├── 用户模型、内置素体/Blockout 与授权全景的 panel-scoped staging
  │   ├── 节点检查、受约束姿势、相机、灯光、网格与 XYZ 指示
  │   └── 按用途生成有界 PNG 与单一 3d-reference context
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

### 3D 参考数据流

```
用户模型 / 内置 guide preset / 授权全景
  → Extension 建立 panel-scoped session 与精确资源投影
  → 独立 model.html Webview 使用 Three.js 临时布置
  → 用户独立选择形象、动作、机位、720° 场景用途
  → Webview 生成角色明确的有界 PNG，Extension 校验 session/revision/purpose
  → Extension 物化可重建 PreviewAsset 并合并为一个 3d-reference context
  → neko.agent.sendContext（下游必须保留用途和 guide 限制）
```

- 源文件始终只读；Preview 不写回模型，也不创建 `.nkm`、`.neko3d`、scene 或 sidecar 项目格式。
- staging 只按 session subject 与 schema version 恢复，是可丢弃的面板 UI 状态，不是 Asset、Entity、Engine 或项目事实。
- 每个面板独立持有 renderer、scene、控制器、session 和 revision；陈旧或串面板消息会显式失败。
- GLB 内嵌纹理产生的 `blob:` URL 只允许作为已检查源在当前 Webview 内的浏览器投影；源文件声明的 `blob:`、远程或越界依赖仍由 Extension 拒绝。
- 发送 Agent 时仅物化用户选择的用途输出；不会上传 3D 二进制、把 guide 素体伪装成形象参考，或通过 generic-image fallback 丢失动作/机位/全景角色。

### 数据流

**视频预览**：`NativeEngine → H.264 NAL (WebSocket) → WebCodecs VideoDecoder → Canvas`

**音频预览**：`NativeEngine → PCM Float32 (postMessage) → Web Audio API → 扬声器`

**文档预览**：`Node Extension Host → loopback HTTP → Webview 文档 renderer`，不经过 Rust Engine。

**3D 参考**：`Extension 精确授权 URI/内置 preset descriptor → Three.js model Webview → purpose output`，不经过 Rust Engine，也不建立持久 Model/Scene 项目。

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
pnpm compile:webview                  # Vite 构建 webview
pnpm compile:extension                # esbuild 构建 extension
pnpm copy:webview                     # 复制产物到 dist/
```

## English Summary

Neko Preview provides read-only media/document previews and temporary 3D reference staging for appearance, pose, camera, and 720-degree scene intent. It accepts GLB, glTF, OBJ, STL, and PLY sources, or opens a project-authored guide-only mannequin without a model file. The Extension authorizes exact resources and owns session/revision checks; the dedicated Three.js Webview owns temporary rendering and purpose-specific captures. The surface never writes source files, creates a durable model/scene project, activates a Rust Model/Scene path, or uploads raw 3D binaries. Agent handoff uses one validated `3d-reference` context whose outputs retain their explicit roles and guide restrictions.
