# 缓存、文件读写服务与路径变量

更新日期：2026-07-13

本文定义 OpenNeko 中路径变量、文件读写边界、内容访问意图、Webview 资源投影和派生缓存的横切设计。它不定义统一实体语义，也不定义素材库业务模型；相关设计分别见 [`unified-entity.md`](unified-entity.md) 和 [`asset-library.md`](asset-library.md)。

## 设计目标

- 让所有创作领域使用一致的路径保存、路径解析、文件读取和缓存投影规则。
- 区分 source path、stable ref、cache artifact、runtime handle，避免把本机状态写入项目事实。
- 让 Webview、Agent、Dashboard、Engine、Assets、Documents 等消费者通过 Host 侧服务读取内容，而不是直接扫描文件系统或缓存目录。
- 保持项目记录和二进制数据分离：`.nk*` 文件适合 Git 同步轻量事实，workspace、资产库、媒体库和 OSS 负责持久数据文件。

## 核心原则

- 持久项目事实只保存 workspace-relative path、`${VAR}/path`、source ref、`ResourceRef`、asset/entity ID 和 provenance。
- 绝对路径只允许出现在本机设置、Host adapter、短生命周期运行态，或用户明确选择的迁移/资产创建来源记录中。
- Add 只把已经 durable 的 source/ref 加入领域文档；Link 直接引用 workspace、资产库、OSS 或 `${VAR}` 下的文件；Create Asset 先把 bytes 落成正式文件或资产，再 Add。
- `Downloads`、`Desktop`、temp 和任意未纳管绝对路径不是隐式导入来源；用户必须明确移入 workspace/资产库、配置路径变量，或取消添加。
- Webview `File`、blob、bytes、粘贴截图和 AI 生成内容必须先经 Host 侧 Create Asset 获得对应二进制文件或资产对象，不能直接写入 `.nk*`。
- Webview 不直接读取文件系统，不扫描 `.neko/.cache/`，不保存 `asWebviewUri(...)` 结果。
- 文件读写属于 Extension Host、平台层或 Engine 受控接口；Webview 和纯 UI 包只消费投影 DTO。
- `neko-engine` 是二进制/媒体数据读取、Range、container entry、sibling resource、解码和预览派生的权威入口；纯文本、配置和 JSON `nk*` 项目文件不经 Engine 读写。
- 交互预览 cache-first，离线导出、打包、校验 source-first。
- 缓存是派生物，删除缓存不得删除项目文件、素材事实、实体事实或用户确认绑定。
- runtime handle 只在当前会话有效，包括 Webview URI、blob URL、Engine token、stream id、preview URL。
- 结构化本地 metadata 统一进入用户级 `~/.neko/neko.db`；有价值状态与可重建投影分别声明为逻辑 `state` / `cache` ownership，workspace 行必须携带显式 `workspaceId`。
- workspace `.neko/.cache/` 只保存可重建 artifact bytes，不保存 SQLite 数据库或 canonical JSON metadata manifest。

## 分层模型

```text
Project facts
  workspace-relative path
  ${VAR}/path
  source ref
  ResourceRef
        |
        v
Path and source resolution
  PathResolver
  ContentAccessService
  ContentIngestService
        |
        v
File access services
  ProjectFileStore / Host fs adapter for text and project facts
  Engine file access for binary and media sources
  Document entry provider
  Media library provider
        |
        v
Derived cache
  thumbnails
  page images
  preview variants
  proxies
  metadata
  semantic sidecars
        |
        v
Runtime projection
  Webview URI
  stream descriptor
  token
  bytes
  local runtime path
```

只有第一层和明确的 stable ref 可以进入持久事实。后续各层是解析、读取、派生和展示，不应反向成为 source identity。

## 路径变量

路径变量解决“项目可移植”和“本机路径不同”之间的矛盾。

| 路径形态                  | 是否可写入项目事实    | 用途                                        |
| ------------------------- | --------------------- | ------------------------------------------- |
| workspace-relative path   | 是                    | 项目内源文件、项目格式引用                  |
| `${VAR}/path`             | 是                    | 团队共享媒体库、外部素材库、可配置 root     |
| absolute local path       | 默认否                | Host 运行时、local override、显式迁移来源   |
| Webview URI               | 否                    | 当前 Webview 展示                           |
| Engine token / stream URL | 否                    | 当前 Engine session                         |
| cache-relative path       | 只允许 cache metadata | artifact 内部定位，不作为项目 source         |

### 变量来源

| 来源                                  | 范围             | 说明                             |
| ------------------------------------- | ---------------- | -------------------------------- |
| workspace root                        | Project          | 默认项目根                       |
| `neko/settings.json` media libraries  | Workspace / Team | 团队共享媒体库变量名和原始路径   |
| `.neko/settings.local.json` overrides | User / Machine   | 本机路径覆盖，不提交             |
| extension/global storage              | User / Machine   | VS Code 私有 artifact/view state，不作为跨 Host metadata authority |
| explicit asset/create root            | Session / Intent | 一次性资产创建或窄授权 root      |

### 解析规则

- 写入项目事实前，优先把本地路径收缩为 workspace-relative path。
- 不在 workspace 内时，尝试收缩为已声明媒体库变量 `${VAR}/path`。
- 无法收缩的绝对路径不能静默写入项目事实；应提示用户移入 workspace/资产库、配置 `${VAR}`、执行显式 Create Asset，或返回诊断。
- 变量名是契约，变量值是环境配置。跨机器同步的是变量名和相对路径，不是本机绝对路径。
- 路径解析失败应返回 unresolved、unauthorized、missing 或 non-portable，不应猜测相邻文件。

### 媒体库映射规则

媒体库变量是 PathResolver 的一等输入。`neko-assets` 负责从团队共享设置和本机覆盖生成 `PathVariableMap`：

| 数据 | 位置 | 是否可提交 | 用途 |
| --- | --- | --- | --- |
| `mediaLibraries[].variable` | `neko/settings.json` | 是 | `${VAR}` 契约名 |
| `mediaLibraries[].path` | `neko/settings.json` | 是 | 团队约定路径，可在不同机器不可用 |
| `mediaLibraryOverrides[VAR]` | `.neko/settings.local.json` | 否 | 本机真实路径覆盖 |
| `ResolvedMediaLibrary.resolvedPath` | runtime projection | 否 | Host 读写、Webview root 授权、Engine/processor 输入 |
| `ResolvedMediaLibrary.accessible` | runtime projection | 否 | 当前机器是否可直接读取 |

媒体库文件的 canonical durable path 是 `${VAR}/relative/path`。当 Host 收到本机绝对路径时，只有在它位于 workspace root 或已声明媒体库 resolved root 内，才允许收缩为 workspace-relative 或 `${VAR}/path`。无法收缩时必须走诊断、Create Asset 或显式 Link/Promote，不得把绝对路径写入项目事实。

`allowedInputRoots = ["mediaLibrary"]` 只授权 enabled、accessible、已解析的媒体库 root。它不授权 `Downloads`、`Desktop`、系统 temp、未声明外部目录，也不授权 Webview 直接读取媒体库。Webview 展示仍必须通过 `LocalResourceAccessService` 和 `asWebviewUri(...)`；大型视频/音频仍优先走 Engine file access。

Processor 或 Agent 产物写入媒体库不是默认行为。Provider scratch、失败中间文件和可重建派生物留在 provider/session/cache 私有目录；一旦结果被声明为 creator-visible completion，generated-output owner 必须先原子保存到 `neko/generated/<kind>/`、建立 digest/lineage/稳定 `ResourceRef`，再向 Agent、Canvas 或其他领域报告完成。AssetLibrary/AssetStore Promote/Create Asset 是后续可选整理动作，不是保存、Workspace Board 投影或项目引用的前置条件。

### Agent / Canvas / Storyboard 资源交接

Agent 工具结果、Canvas send、Storyboard generation 和 `neko-composite` artifact 必须把图片身份表达为结构化引用，而不是运行时路径：

| 交接字段 | 稳定性 | 规则 |
| --- | --- | --- |
| `ResourceRef`、`cacheResourceRef`、`documentResourceRef`、source ref | 稳定 | 可以进入 Agent session、Canvas 节点、Storyboard 行、Composite artifact 和项目事实。 |
| workspace-relative path、`${VAR}/path` | 稳定 | 可以作为 source identity；Host 负责解析和授权。 |
| `display.runtimeOnly` 下的 Webview URI、renderUri 或 runtime diagnostic | 运行时 | 只能用于当前 Webview 展示或诊断；不能被 downstream payload 当图片身份。Host 内部 materialized path 不写入 Webview/clipboard 稳定引用。 |
| legacy `cachePath` | 迁移/诊断 | 读取旧数据时可识别，写出新 payload 前必须剥离；不能作为 durable identity。 |
| 系统 temp、`/var/folders/...`、`/tmp`、Downloads、Desktop、`file:`、blob/object URL | 非法 | 不能作为 Webview/Canvas/storyboard 成功路径；应返回 unauthorized/non-portable diagnostic。 |

`cachePath` 与 `.neko/.cache/resources` 的区别很重要：前者是旧工具链暴露的实体副本路径字段，后者是当前受管资源缓存 root。即使某个运行时路径实际位于 `.neko/.cache/resources`，也不能把它直接写成项目事实；长期 payload 仍应保存 `ResourceRef`、source ref 或可移植 source path。

Agent Webview 的工具引用 JSON 使用 `protocolVersion: 2` 时，durable body 只保存结构化 refs。投影给当前 Webview 的 `renderUri` 只能存在于当前消息投影/组件状态，发送到 Canvas、Storyboard 或剪贴板稳定引用前必须移除。旧会话如果只有 temp/cache 路径而没有结构化引用，应展示诊断和文本上下文，不能伪装为可点击图片。

旧 generated-output record 如果只带有 `.neko/.cache/generated` 或 `.neko/.cache/resources` path，必须视为 migration candidate；文件仍存在也不能证明它是 durable source。显式 retain 动作可以在校验 digest 后复制到 `neko/generated/<kind>/` 并建立 canonical lifecycle，随后按用户意图投影；需要 AssetLibrary 能力时再单独 Promote/Create Asset。源不可用时返回 relink/regenerate diagnostic，不做同名或 cache fallback。

### 文档内容定位协议

文档内容定位分成 source、locator 和 resource 三层，不允许用缓存路径或容器内部文件名代替任意一层：

| 层级 | Canonical contract | 用途 | 禁止替代 |
| --- | --- | --- | --- |
| 文档源 | `ContentSourceRef`，例如 `{ kind: "file", path: "${A}/book.epub" }` | 标识 EPUB/PDF/CBZ/Office 等原始文档来源，进入 `ReadDocument.source`、Preview open、Canvas add-source | 绝对路径、Engine token、Webview URI、cache path、document-reader scratch path |
| 文档位置 | `DocumentLocator` / `DocumentRange` / `DocumentBatchCursor` | 表达章节、spine、页、entry、范围和批处理游标 | EPUB entry path 字符串、页图缓存文件名、临时 HTML 路径 |
| 文档图片资源 | `DocumentArchiveResourceRef`，由 `ReadDocument.imageInfo[].resourceRef` 返回 | 标识某个文档 entry/page image，可传给 `ReadImage.images[].resourceRef`、Canvas、Storyboard、artifact | 整本 EPUB/PDF、`imageInfo.path`、`cachePath`、`.neko/.cache/...`、`/tmp/...`、`webviewUri` |

Agent 工具链必须使用两步协议读取文档图片：

1. `ReadDocument({ source, mode: "manifest" | "range" | "next", include_images: true })` 返回文本、manifest/range/cursor、`imageInfo[]` 和 `imageInfo[].resourceRef`。
2. `ReadImage({ images: ReadDocument.imageInfo[] })` 根据结构化 `resourceRef` 经统一内容访问和资源缓存物化 bytes/metadata，并把图片作为 native multimodal attachment 暴露给当前 Agent turn。

`ReadDocument` 不返回可复用图片路径，`ReadImage` 不接受图片路径、EPUB entry path、整本文档 source 或缓存目录。若工具调用参数被平台适配层包成 `_raw` JSON 字符串，ToolRegistry 只允许在 schema 校验前恢复合法 JSON object；恢复失败必须保留校验错误，不得进入旧字段兼容链路。

文档图片缓存由 `ResourceCacheService` 和 document provider 透明处理。缓存 key 可以由 source identity、locator、entryPath、variant 和内容 fingerprint 重建；上层业务只持有 `DocumentArchiveResourceRef` 或 `ResourceRef`，不能查询 manifest、扫描 cache root、反查物理路径，或把 materialized path 当作成功输出。缓存被清空时，下一次 `ReadImage`、Preview projection 或 Canvas render 应通过 provider 重建，而不是要求 Agent 传入旧路径。

## 文件读写服务

文件读写服务按 intent 和信任边界分工。

### 跨领域内容访问分工

`ContentAccessService` / `ContentIngestService` 是跨领域的公共编排层。各领域不应分别实现自己的“文件读取服务”“缓存服务”“路径转换服务”或“Webview URI 服务”；领域只提供 provider、adapter 和领域语义。

Extension Host 侧统一通过 `@neko/shared/vscode/extension` 的 `createHostContentAccessRuntime(...)` 装配公共能力。这个 factory 负责组合 `LocalResourceAccessService`、`ResourceCacheService`、`ContentAccessService`、`ContentIngestService`、Webview resolver、Engine source resolver hook 和 provider registration。Feature package 不应直接 `new HostContentAccessService`、`new HostContentIngestService`、`new VSCodeResourceCacheService` 或调用 `createDefaultLocalResourceAccessService` 来重新实现一套规则；需要领域差异时，只传入 provider/adapter。

跨领域内容语义放在中立 domain service，而不是放在 Agent。`@neko/content` 承载 Canvas、Cut、Preview、Agent 等领域都会用到的文档解析、manifest/range、locator、图片元数据探测等内容语义；它只依赖共享契约和注入的 runtime deps，不拥有 VSCode API、缓存目录、Webview URI 或 Engine client。Extension Host 负责把 `@neko/content` 的读取需求接到 `ContentAccessService`、`ResourceCacheService` 和 `@neko/neko-client` 的 Engine file access adapter。

公共层统一管理：

- source/ref 解析、`${VAR}` 和 workspace-relative 路径转换；
- workspace、媒体库、extension-private、Webview roots 和 Engine file access 授权；
- cache root、variant key、fingerprint、MD5/内容去重、LocalMetadata ledger、重建、失效和 GC；
- `ResourceRef`、document source ref、generated asset ref 与 Webview URI、Engine source、bytes、local runtime path 之间的投影；
- fail-visible diagnostics，包括 unresolved、unauthorized、unsupported、missing、stale、non-portable 和 service-unavailable。

领域层保留：

- 领域 source 类型、节点/时间线/图层/模型/文档/字幕等业务语义；
- provider 能力声明和 materialize/probe/preview/proxy 的领域适配；
- Webview 交互、渲染、控件、状态投影和用户动作；
- 最终导入、导出、保存和 “reveal/open” 等用户可见副作用。

判断规则：

| 内容类型或动作 | 默认入口 | 说明 |
| --- | --- | --- |
| 纯文本、配置、Markdown、JSON/TOML/YAML、`nk*` 项目事实 | `ProjectFileStore`、domain codec、Host text adapter | 不经 Engine，不进入资源缓存；需要 schema、诊断、路径收缩和原子保存。 |
| 图片、音频、视频、模型、Puppet、PSD、PDF/EPUB/CBZ/Office 等二进制或容器源 | `ContentAccessService`，底层走 Engine file access 或领域 provider | 统一授权、路径转换和 source/ref 诊断；需要 Range、entry、probe、decode 或大文件读取时由 Engine 执行；文档语义解析由 `@neko/content` 提供。 |
| 文档页图、缩略图、preview variant、proxy、FOV crop、OCR/ASR/metadata sidecar | `ResourceCacheService` provider，通过 `ContentAccessService` 访问 | 属于可重建派生物。上层只持有 `ResourceRef` 和 variant，不依赖 materialized path。 |
| 播放、流、GPU/媒体计算、导出编码、waveform、模型 viewport stream | `@neko/neko-client` / `EngineClient`，由 Extension Host 授权和注册 source | 可直接使用 Engine client，但 source 注册、权限、token 生命周期和路径收缩仍归 Host/content-access 边界。 |
| Webview 展示 URI | `LocalResourceAccessService` 或 `ResourceCacheService.project()` | 只产生当前 Webview runtime handle；不能进入项目事实、Agent memory 或跨包 payload。 |
| 用户选择的最终导出路径、正式导入资产路径 | Domain save/import service + `ContentIngestService` | 这是用户事实或项目事实，不是缓存；不得用 `.neko/.cache` 作为成功合约。 |

当前实现边界：

| 层级 | 入口 | 可扩展点 | 禁止 |
| --- | --- | --- | --- |
| Shared Host runtime | `createHostContentAccessRuntime(...)` | `accessProviders`、`ingestProviders`、`resourceCacheOptions.providers`、`webviewResolver`、`engineSourceResolver` | 了解 Canvas/Cut/Preview/Agent 业务语义 |
| Content domain service | `@neko/content/document` | document reader runtime deps、manifest/range/locator、image metadata probe | 管理 cache root、Webview URI、Engine token、VSCode extension lifecycle |
| Engine file adapter | `@neko/neko-client/engine-file-access` | Engine register/range/entry/source adapter | 路径变量、cache metadata、Webview projection、领域 UI |
| Resource providers | `DocumentResourceCacheProvider`、`ThumbnailResourceCacheProvider`、`PreviewVariantResourceCacheProvider`、`GeneratedAssetDerivativeResourceCacheProvider` 等 | `ensure/probe/materialize` adapter | 决定项目事实、Webview UI 或 durable source identity |
| Feature package | Canvas/Cut/Preview/Agent/Assets/Audio/Model/Sketch provider adapter | source/ref shaping、variant intent、UI workflow | 直接管理 cache root、metadata ledger、Webview URI fallback、Engine source path policy |

按领域的期望分工：

| 领域 | 需要支持的内容 | 统一内容访问边界 | 可直接走 `@neko/neko-client` 的场景 | 不需要资源缓存的场景 |
| --- | --- | --- | --- | --- |
| `neko-canvas` | 文本、图片、音视频、文档页图、模型、generated assets | 节点引用、预览资源、document resource、generated asset、thumbnail/proxy/FOV crop 通过 `ContentAccessService` 和 `ResourceCacheService` | Canvas 播放工作区、音视频流、模型/预览 stream、Engine-backed preview route | `.nkc` 项目事实、节点文本、布局、用户确认保存的画布文件 |
| `neko-preview` | 文档、图片、音视频、全景媒体 | Custom editor 打开前的 source 授权、document entry/page image、轻量预览投影走统一服务 | 视频/音频/全景播放、Range/seek、decode/probe、engine-backed panoramic preview | 纯文本 outline、当前 Webview UI 状态、用户打开的原始 source identity |
| `neko-cut` | 字幕、图片、音视频、LUT、proxy、thumbnail、导出 | source ingest、proxy/thumbnail/preview variant、素材引用和 export source resolution 走统一服务 | 播放、probe、frame extraction、waveform、proxy generation、export/transcode | `.nkv` 时间线事实、用户可编辑字幕 cue、最终导出文件 |
| `neko-model` | GLB/GLTF/VRM、贴图、环境图、scene stream | 模型 source、sibling textures、environment preview/thumbnail 走统一服务或 provider | viewport/scene stream、GPU render、model preprocess/probe、texture decode | `.nkm` scene/project facts、transform/material 参数、用户确认导入后的模型引用 |
| `neko-sketch` | PSD、图片、NKS 图层、参考图、generated art | PSD source、PSD preview、参考图、外部 raster source 和派生缩略图走统一服务 | 将来 Engine-backed PSD/raster decode、GPU filter/export、large image preprocess | `.nks` 图层/笔刷/向量事实、Webview 内部编辑状态、用户保存的正式图像文件 |
| `neko-agent` | 文档、图片、附件、感知资产、generated media | Agent tool、attachment、perception、document image、generated asset 投影全部走 Agent content runtime backed by shared services | provider 需要 Engine-backed bytes/source、视频预处理、媒体 probe/decode | prompt 文本、配置、skill metadata、工作记忆中的稳定 ref/text 摘要 |
| `neko-assets` | asset file、thumbnail、metadata、media library | Asset visual、thumbnail、metadata sidecar 可作为 resource/cache provider；路径变量和媒体库 root 进入统一 content boundary | engine thumbnail/probe/extract metadata | asset/entity/library facts、用户正式导入的 source 文件记录 |

结论：公共规则由统一内容访问服务管理，领域只实现 provider/adapter。只要两个以上领域需要相同的路径、权限、缓存、projection 或 Engine source 规则，就应放入 `@neko/shared` / `@neko/shared/vscode/extension` 或 `@neko/neko-client` 边界；两个以上领域共享的内容语义放入 `@neko/content` 这类中立 domain service；只有 UI 行为、项目格式和用户工作流留在 owning package。

当前迁移和分类快照：

| 领域 | 当前规则 | 后续边界 |
| --- | --- | --- |
| Preview document | PDF/EPUB/CBZ/DOCX 打开时通过 `createHostContentAccessRuntime(...)` 解析 path-backed source，并只向 Engine 注册 runtime token；Webview 只拿 Engine HTTP/Range URL。 | 文档页图、entry image 和缩略图需要复用时继续进入 `DocumentResourceCacheProvider` / `ResourceCacheService`，不得把 Engine token 或 URL 写入文档事实。 |
| Model | GLB/GLTF/VRM 和环境图进入 Engine 前先经 shared content access 的 `engine-source` target；`.nkm` JSON 仍走 `ProjectFileStore`。 | sibling texture、环境预览和 model preview variant 只注册 provider/adapter；Viewport stream、GPU render、model preprocess 继续直接走 `@neko/neko-client`。 |
| Assets | `AssetEntity`、variant file、正式 `thumbnailPath` 是素材事实或正式资产文件引用；media-library 缩略图、metadata、search index 是可重建/可丢弃的 bounded runtime cache。`NekoAssetsAPI.createThumbnailResourceRef()` 和 `getThumbnailVisual()` 是跨包 ResourceRef/visual 入口，`getThumbnailPath()` 是 legacy/TreeView 兼容路径。 | 新跨包消费者必须请求 ResourceRef/visual 或 content-access provider，不读取 Assets 私有 thumbnail/metadata/index 文件。旧 TreeView tooltip/icon 可暂时使用本地路径，但不能写入项目事实。 |
| Sketch | `.nks` 项目事实、PSD/raster source add 和正式导入走 `ProjectFileStore` / add-source；AI result/context 文件位于 extension-private runtime cache，并通过 shared local resource runtime 授权 Webview 投影或 Host/provider `fileUri` 临时输入。 | `SketchAIAssetRef.webviewUri/fileUri` 仅限当前 AI run，必须在 apply/cancel/dispose 后清理；不得进入 `.nks`、Agent durable memory、Canvas/storyboard payload 或 package manifest。PSD layer preview、reference image 和 generated art 长期引用应提升为 ResourceRef/asset ref。 |

### Engine、文件读写与缓存边界

`ContentAccessService` 是上层业务的统一内容访问编排入口。Agent、Canvas、Storyboard、Preview、Assets 和 Webview host handler 不应直接决定“读源文件、读缓存、注册 Engine token、投影 Webview URI”这些细节；它们应声明 intent、source/ref、target 和 caller，由 Host 侧服务路由。

文件读写按数据性质分流：

| 数据类型 | 权威入口 | 说明 |
| --- | --- | --- |
| 纯文本、配置、JSON/TOML/Markdown、`nk*` 项目事实 | `ProjectFileStore`、domain codec、Host fs adapter / `workspace.fs` | 负责 schema、诊断、路径收缩、原子写入和项目事实生命周期；不经 Engine。 |
| PDF/EPUB/CBZ/CBR/Office 等文档语义 | `@neko/content/document` + 注入的 Host runtime deps | 负责 document format、manifest/range、locator、entry refs、图片元数据；不决定缓存目录和 Engine token。 |
| 图片、视频、音频、模型、Puppet、PSD 等二进制或媒体源 | `neko-engine` file access / preview API | 负责 path authorization 后的 token、Range、container entry、sibling resource、probe、decode、preview/proxy/thumbnail 生成。 |
| 文档页图、缩略图、preview variant、proxy、OCR/ASR/metadata sidecar 等派生物 | `ResourceCacheService` + provider | 文件缓存只保存可重建 artifact；metadata ledger 位于用户级 SQLite cache tables，不成为 source identity。 |
| Webview 展示资源 | `LocalResourceAccessService` 或 `ResourceCacheService.project()` | 只产生当前 Webview 可用的 URI/projection，不写入项目事实。 |

`ResourceCacheService` 决定缓存规则、variant key、fingerprint、MD5/内容去重、metadata ledger、重建、失效和 GC；它不决定原始文件身份，也不替代 Engine 的二进制读取。`neko-engine` 负责二进制/媒体数据的实际读取和派生计算，但不决定长期缓存目录、cache metadata 或项目事实写入。两者由 `ContentAccessService` 按 intent 编排。

因此：

- `ReadImage`、文档图片读取、媒体预览和缩略图生成属于二进制/媒体路径，源字节和派生计算应经 Engine 或 Preview provider；结果需要复用时再进入 `ResourceCacheService`。
- `ReadDocument` 对纯文本文件可以走文本/项目文件入口；对 PDF、EPUB、CBZ/CBR、DOCX/PPTX/XLSX 等容器或二进制文档，range、entry、内嵌资源和页图应经 Engine file access 或文档 entry provider。
- Agent、Skill、Webview presenter、Canvas 和 artifact 只持有 `ResourceRef`、document source ref、workspace-relative path、`${VAR}/path` 或 asset/entity ID；不得持有缓存路径、Engine token、Webview URI、blob URL 或 scratch path 作为 durable identity。
- 缓存路径由缓存服务透明处理。业务层不得根据 `.neko/.cache/resources`、`documents/`、`thumbnails/`、`previews/` 等目录结构分支，也不得把 materialized path 当作成功合约。

| 服务                         | 负责                                                                      | 不负责                                    |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `PathResolver`               | `${VAR}/path`、workspace-relative、运行时绝对路径之间的转换               | 缓存选择、Webview 投影、导出语义          |
| `ContentAccessService`       | 按读取意图选择 source、cache、proxy、Engine source、bytes 或投影          | 写入新 source、管理实体或素材事实         |
| `ContentIngestService`       | 执行 Host 侧 Add/Link/Create Asset、注册 durable source、落盘 byte-only 输入 | Webview 展示、低层 range 读取、隐式复制未纳管文件 |
| `ResourceCacheService`       | `ResourceRef`/variant 的 materialize、resolve、project、invalidate、gc    | 原始素材身份、最终导出输入                |
| `LocalResourceAccessService` | Webview roots 授权和 `asWebviewUri(...)` 投影                             | 缓存物化、source fingerprint、离线读取    |
| Engine File Access           | 二进制/媒体源、range、container entry、sibling resource、Engine 可读 source token | 纯文本项目文件、项目路径身份、Webview URI、cache metadata |
| Project fact stores          | JSON/project 文件的原子读写、schema guard、锁或串行化                     | 派生缩略图、搜索排序、runtime token       |

### 项目文件 I/O

`@neko/shared/project-file-io` 是 JSON `nk*` 项目文件的稳定 host 持久化入口。`.nkv`、`.nkc`、`.nks`、`.nkp`、`.nkm`、`.nka` 等格式继续由各自 domain codec 拥有 schema、验证、迁移、默认值和序列化；Extension Host 通过 `ProjectFileStore` 调用注册的 `ProjectFormatCodec`，并在写入前应用对应的 `PortableSourcePathPolicy`。

`ProjectFileStore` 负责项目文件生命周期：load、save、save-as、backup、revert、diagnostics、只读 future-version 状态、串行化写入和 best-effort atomic write。它通过注入的 `ProjectFileOps` 执行文件操作，不导入 VS Code API；VS Code 运行面使用 `@neko/shared/vscode/extension` 的 `createVSCodeProjectFileIoAdapter` 连接 `workspace.fs`、workspace roots、document URI、路径变量和授权 roots。打开、加载、迁移和解析投影不得触发项目保存；autosave 必须等文档完成打开基线建立并有用户/系统编辑原因后才能写入。

新增或迁移 `nk*` host 持久化入口时，应复用 `ProjectFileStore` 和 codec registry，而不是在具体 editor provider 中重新实现 `JSON.parse/stringify`、`workspace.fs.writeFile`、路径收缩、backup 或 future-version 逻辑。Webview 仍只能通过 typed message / document host 发送编辑和 add-source intent，不能写项目文件，也不能把 `File.name`、blob URL、Webview URI、Engine token、stream id、preview URL、cache path 或 `cachePath` 作为 durable source identity。

## 读取意图

调用方不能只看 target 类型判断应读 source 还是 cache。必须声明 intent。

| Intent                | 默认策略                                           | 允许使用缓存 | 离线安全 |
| --------------------- | -------------------------------------------------- | ------------ | -------- |
| `interactive-preview` | cache-first，必要时投影 Webview URI                | 是           | 否       |
| `agent-context`       | cache/preprocess-first，保留 source/locator        | 是           | 有条件   |
| `edit-playback`       | proxy/stream-first，保证响应性                     | 是           | 否       |
| `cache-materialize`   | 从 source 生成 cache artifact                      | 是           | 否       |
| `final-export`        | source-first，读取原始文件或 Engine source         | 默认否       | 是       |
| `package`             | source-first，读取原始文件或 container entry bytes | 默认否       | 是       |
| `verify`              | source-first，读取原始 bytes/hash/probe            | 默认否       | 是       |

如果 `final-export`、`package` 或 `verify` 收到 thumbnail、preview、proxy、Webview URI、blob URL、runtime token 或 legacy `cachePath`，应返回 diagnostic，而不是复制缓存文件。用户明确选择 draft/proxy 导出时，必须在结果中记录使用了派生物。

## Add / Link / Create Asset

写入项目事实前必须先判断写入对象是 durable source、byte-only input、cache artifact、runtime state 还是用户确认事实。默认入口使用 Add / Link / Create Asset，而不是把所有外部来源都叫做 import。

| Mode                       | 用途                                           | 输出                                 |
| -------------------------- | ---------------------------------------------- | ------------------------------------ |
| `add`                      | 把已 durable 的 source/ref 加入领域项目         | 项目内 portable ref 或 domain record |
| `link`                     | 直接引用 workspace/资产库/OSS/`${VAR}` 文件     | 收缩后的 source ref                  |
| `create-asset`             | 将 Webview bytes、粘贴截图、AI 输出落为正式资产 | stable source ref，可带 prewarm hint |
| `stage-export`             | 记录最终导出或 package 输出                    | staged output，不改写项目 source ref |
| `cache-artifact`           | 缩略图、文档页图、proxy、preview variant 预热  | cache entry，不生成项目 source       |

来源处理矩阵：

| 输入来源                                      | 处理方式                | 说明                                   |
| --------------------------------------------- | ----------------------- | -------------------------------------- |
| workspace/project 文件                        | `link` 后 `add`         | 保存 workspace-relative path           |
| 资产库、媒体库、OSS 或配置的 `${VAR}` 文件     | `link` 后 `add`         | 保存 `${VAR}/path`、asset ref 或 OSS ref |
| 允许的 remote source                          | `add`                   | 仅限字段明确允许 remote source identity |
| `Downloads`、`Desktop`、temp、未纳管绝对路径   | 诊断                    | 提示移入 workspace/资产库或配置变量    |
| Webview `File`、blob、bytes                   | `create-asset` 后 `add` | Host 负责命名、落盘、资产记录和诊断    |
| paste 截图、AI 生成 bytes                     | `create-asset` 后 `add` | 先获得真实二进制文件或资产对象         |
| cache、proxy、thumbnail                       | 诊断                    | 不提升为 source，不作为项目事实         |
| Webview URI、blob URL、Engine token、stream id | 诊断                    | 仅为当前会话 runtime handle            |

### Generated 输出保存路径

Generated 输出先按 ownership 分类，再决定保存位置。不能把 creator-visible completion 放进 `.neko/.cache`，也不能让 cache 文件存在本身表示用户成果已保存。

| 分类 | 保存位置 | 是否用户可感知 | 是否可进入项目事实 | 删除后语义 |
| --- | --- | --- | --- | --- |
| 运行中 scratch / provider 临时文件 | system temp、provider 私有目录或 extension-private runtime dir | 否，只用于一次调用 | 否 | 可删除，调用失败或重试自行处理 |
| Creator-visible generated output | `neko/generated/<kind>/` | 是，属于工作区创作结果 | 是，以 generated-output `ResourceRef`、digest 和 lineage 引用 | 不受 cache TTL/GC 管理；删除必须显式且引用感知 |
| 可选 AssetLibrary 整理结果 | AssetStore ingest policy 选择的项目/媒体库 durable root | 是 | 是，使用独立 Asset identity/source ref | 由 AssetLibrary retention 与引用规则管理；不替代或静默删除 generated source |
| `.nkc` / `.nkv` 等项目引用 | 项目文件只保存稳定 ref、workspace-relative locator 和 owner metadata | 是 | 本身就是项目事实 | 删除项目节点不等于删除 generated/Asset source |
| 生成结果的缩略图、预览图、代理、metadata | artifact bytes 位于 `.neko/.cache/resources`；variant/metadata 位于 `~/.neko/neko.db` cache tables | 间接可见 | 否 | 可删除并由正式 source/ref 重建 |

因此，`generated-assets/...` 和 lifecycle `ResourceRef` 表示 revision-bound creator-visible generated-output identity，不等于 AssetLibrary identity，也不是 `.neko/.cache/generated/...` 的路径别名。它可以直接进入 Workspace Board 和接受 generated source 的领域项目；需要素材库检索、实体绑定或正式变体管理时再显式 Promote/Create Asset，并保留两个 identity 的区别。

Generated-output owner 管理 retain/delete。删除必须先完成项目引用检查；检查能力不可用、仍被 `.nkc`/`.nkv` 等项目引用或路径不在 canonical root 时必须拒绝。删除 Canvas 节点、对话记录或 Asset membership 都不能隐式删除 `neko/generated/` 文件。旧 runtime record 只有在源可解析时才能通过显式 retain/project 动作复制或保留并建立 lifecycle；源缺失时返回 relink/regenerate diagnostic，不搜索同名文件、不回退 cache，也不宣称旧 runtime Canvas 布局已迁移。

### Generated output 与版本控制

`neko/generated/` 是用户拥有的工作区输出，不是 `.neko` 私有元数据。项目可按团队协作、文件大小、LFS 和可再生成性决定提交全部、部分或忽略；Neko 不得自动修改用户 `.gitignore`。若团队忽略二进制但提交引用它们的 `.nkc`/`.nkv`，其他机器打开时必须得到 source unavailable/relink diagnostic，而不是从 cache、文件名相似度或 AssetLibrary 猜测替代源。

各领域的 Add handler 只保存引用和领域编辑事实，不把大型二进制封装进 `.nk*`：

| 类型                         | 持久化策略                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| 视频、音频、图片             | 直接 Link durable file/source，播放和缩略图走 Engine/Cache 投影             |
| 字幕                         | 可 Link 外部字幕；用户选择可编辑字幕时，转换为领域 cue 记录并保留 provenance |
| `.cube` LUT                  | Link 外部 LUT；解析结果是运行时/缓存投影                                    |
| PSD                          | 可 Link 原始 PSD；作为 Sketch 可编辑层时，保存 source ref、图层记录和派生资产 |
| `.glb`、`.gltf`、`.vrm`      | Link durable model source；贴图和 sibling resources 通过 locator/解析服务读取 |
| `.moc3`、Live2D 目录或 zip   | Link durable puppet source；zip 只解析 index/locator，不嵌入二进制          |
| raster layer / generated art | 长期使用 asset/dataRef；避免把大块 base64 或 cache path 写入 `.nks`         |

## ResourceRef 与缓存变体

`ResourceRef` 表达“这个派生资源来自哪里、由谁提供、如何判断 stale”。`ResourceVariantRef` 表达“为了某个用途生成的哪种表现”。两者都不是文件路径。

| 概念           | 设计含义                  | 示例                                                                      |
| -------------- | ------------------------- | ------------------------------------------------------------------------- |
| `scope`        | 资源可携带范围            | `project`, `global`, `extension-private`                                  |
| `provider`     | 谁能 materialize 或 probe | document provider、thumbnail provider、proxy provider、generated-derivative provider |
| `kind`         | 资源大类                  | `document`, `media`, `generated`, `preview`, `storyboard-reference`       |
| `source`       | 原始来源                  | file、document、media-library、generated-asset、preview-asset、remote-url |
| `locator`      | source 内部位置           | document page、archive entry、storyboard shot、preview route              |
| `fingerprint`  | stale 判断依据            | hash、mtime-size、provider fingerprint、identity                          |
| `variant role` | 派生表现用途              | `thumbnail`, `page-image`, `preview`, `proxy`, `fov-crop`                 |

同一 `ResourceRef` 可以有多个 variant。比如一个 PDF 页面可以派生 `thumbnail`、`page-image` 和 OCR sidecar；一个视频 source 可以派生 `thumbnail`、`proxy` 和 preview clip。variant 可以删除和重建，source identity 不能被 variant path 替代。

图片 source 不因 UI 或 Agent 需要完整查看而复制进 ResourceCache。未变换的完整图片通过 Host 授权后的 source bytes、local path 或 Webview URI 投影访问；`thumbnail` 必须是带明确尺寸边界并经过缩放/转码的派生物。若 Host 缺少图片变体生成能力，thumbnail 请求应返回 diagnostic，不得把原图复制到缓存并伪装为成功。`preview` 只有在发生限尺寸、转码、裁切或其他可验证变换时才进入缓存，否则走 source projection。

视频 thumbnail 是抽取并缩放后的代表帧；文档 `page-image` / `document-entry` 是从容器或页面定位物化的独立派生内容。这两类内容即使视觉上是图片，也不同于复制一个已经独立存在的图片 source。

Generated source asset 本身不是 ResourceCache variant。ResourceCache 只允许保存 generated source 的派生 variant，例如 thumbnail、preview、proxy 或 probe metadata。需要长期使用的 generated source 必须先成为 AssetStore/GeneratedAssetStore 管理的正式 source，再通过该 source 创建派生 variant。

## 缓存生命周期

```text
source fact / ResourceRef
  -> resolve LocalMetadata entry
  -> probe source fingerprint
  -> materialize variant
  -> verify written artifact
  -> update cache-owned metadata transaction
  -> project to Webview or return descriptor
  -> touch lastAccessedAt
  -> invalidate / mark stale / gc
```

### 状态语义

| 状态            | 含义                                              | 消费方式                                  |
| --------------- | ------------------------------------------------- | ----------------------------------------- |
| `ready`         | variant 可读取，fingerprint 与 source 匹配        | 可直接投影或读取                          |
| `missing`       | metadata row 或文件不存在，但 source 足够重建     | 可按 intent 触发 materialize              |
| `stale`         | source fingerprint、provider version 或参数已变化 | 可展示旧预览并安排重建，离线操作回 source |
| `materializing` | provider 正在生成或刷新                           | UI 显示进行中，读者等待或降级             |
| `unsupported`   | 没有 provider 或格式不支持                        | 返回诊断，不猜测 fallback                 |
| `unauthorized`  | 当前 workspace/root/token 不允许访问              | 提示授权、重新 Link 或 Create Asset，不绕过 Host |
| `failed`        | provider 执行失败                                 | 保留错误诊断，可重试                      |
| `non-portable`  | 只在 extension-private 或本机会话内有效           | 不能写入跨包持久 payload                  |

### 读写操作

| 操作         | 语义                     | 是否允许生成文件                 | 是否返回 Webview URI |
| ------------ | ------------------------ | -------------------------------- | -------------------- |
| `resolve`    | 查询现有 entry/variant   | 否                               | 否                   |
| `ensure`     | 确保 variant 存在        | 可按 `materializeIfMissing` 生成 | 否                   |
| `project`    | 确保并投影到当前 Webview | 可按 intent 生成                 | 是                   |
| `invalidate` | 让 ref 相关 entry 失效   | 否                               | 否                   |
| `stats/gc`   | 统计和回收缓存           | 删除缓存                         | 否                   |

写入缓存应先物化文件，再通过 owning repository transaction 更新 cache-owned metadata。metadata row 只记录已校验 artifact，并保留 `createdAt`、`updatedAt`、`lastAccessedAt`、`sizeBytes`、`status` 和 provider metadata。

## 自动缓存与预热

自动缓存的目标是降低交互延迟，不是提前构建所有派生物。

| 触发         | 适合自动缓存                                | 不适合自动缓存                        |
| ------------ | ------------------------------------------- | ------------------------------------- |
| 项目打开     | 轻量 metadata、已有 index summary、partition revision | 全量视频 probing、OCR、ASR、embedding |
| 素材添加/创建 | 文件 identity、基础 metadata、小缩略图      | 大尺寸 proxy、复杂语义索引            |
| Webview 可见 | 当前 viewport 周边 thumbnail/page-image     | 不可见列表的所有高清变体              |
| Agent 上下文 | 有界片段、低分辨率图、transcript chunk      | 无来源的大型 scratch 内容             |
| 用户显式预览 | preview/proxy/fov-crop                      | 与当前 intent 无关的表现              |
| idle         | 低优先级 thumbnail、semantic sidecar        | 会挤占交互、GPU、磁盘预算的批量任务   |

自动缓存必须可取消、可去重、可降级，并遵守 quota。资源缓存的默认 budget policy 是项目 `.neko/.cache/resources` 最多 2 GiB，global/extension-private resource cache 最多 512 MiB；`ResourceCacheService.gc()` 按 LRU 删除可重建变体，并跳过 pinned、session-active、promoted、debug、non-rebuildable 和 outside-root 条目。后台生成失败只影响 freshness 和诊断，不改变项目事实。

## 一致性与并发

- source fingerprint 变化、provider 版本变化、variant 参数变化、授权 roots 变化都可以让缓存变为 `stale`。
- metadata partition 丢失、缓存文件丢失或 SQLite cache row 损坏应进入 typed stale/rebuild diagnostic，不应污染事实层。
- 同一 ref/variant 的并发 materialize 应合并为一个 in-flight 操作。
- cache metadata 更新必须使用 repository transaction 和 partition revision；JSON project fact 写入应使用 owning project-file service 的原子保存。
- provider 输出应写入 cache root 下的受管目录，避免写入 workspace 任意位置。
- GC 只删除缓存文件和 allowlisted cache rows，不删除 `neko.db`、state rows、`neko/assets/library.json`、entity facts、binding facts 或领域项目文件。
- pinned variant、当前会话活跃 variant 和不可重建 variant 在 GC 中优先保留。

## 典型链路

### 预览展示

```text
source ref / ResourceRef / assetRef
  -> ContentAccess(interactive-preview)
  -> ResourceCacheService.project
  -> LocalResourceAccessService.toWebviewUri
  -> Webview projected URI
```

该链路适合小型图片、文档页图、thumbnail、extension 静态资源和无需 seek 的轻量预览。视频、音频、全景、大型文档、container entry 或需要 Range/seek 的资源应走 Engine file access：

```text
source ref / ResourceRef / project path
  -> Extension Host authorization
  -> Engine register/probe
  -> range URL / stream descriptor / compatible proxy URL
  -> Webview client
```

### Agent 上下文

```text
ProjectSearchItem / selected source
  -> ContentAccess(agent-context)
  -> bounded text/media/context chunks
  -> model input
```

Agent 上下文可以消费缩略图、文档页图、transcript、OCR、ASR 或 semantic evidence，但这些材料必须保留 source/locator。

### 导出、打包与校验

```text
project format refs
  -> ContentAccess(final-export/package/verify)
  -> Engine source / original file / document entry bytes
  -> export artifact or diagnostic
```

离线链路默认不使用 thumbnail、preview、proxy、Webview URI、blob URL 或 legacy `cachePath`。

## 约束与反模式

| 反模式                                          | 风险                         | 正确边界                                        |
| ----------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| 把 cache path 写入 Canvas/Agent durable payload | 换机器、清缓存、重建后断链   | 保存 `ResourceRef`、source ref、asset/entity ID |
| Webview 扫描 `.neko/.cache/`                    | 绕过授权和 provider 语义     | Extension Host 投影                             |
| 以绝对路径作为项目事实                          | 跨机器不可移植，泄露本机结构 | workspace-relative 或 `${VAR}/path`             |
| 把 `projectedUri` 当 source                     | 只在当前 Webview 有效        | source ref + runtime projection 分离            |
| 用 `asWebviewUri` 播放大型音视频并依赖 seek     | Range/codec/CSP 不稳定       | Engine file access / stream descriptor          |
| 把大型媒体整体转成 data URI 或无界 blob         | 内存膨胀，无法证明生产性能   | bounded fixture 或 Engine proxy/stream          |
| Search 或 UI 直接读取私有 cache JSON            | read model 与缓存格式耦合    | 走 Search/Cache service                         |
| Engine stream token 写入项目格式                | 会话结束即失效               | 保存 source ref，运行时重新申请 token           |

## Review Gate

涉及文件、文档、媒体、模型、附件、缩略图、preview/proxy、导入、导出或跨包资源传递的变更，review 必须按路径级别确认：

- 上层业务只传递 intent、source/ref、target 和 caller，没有直接选择 cache 目录、cache metadata table、Webview URI、Engine token 或 scratch path。
- 二进制/媒体/container entry 通过 Engine-backed content access 或注册 provider；纯文本、配置和 `nk*` 项目事实通过项目文件/text 服务。
- Webview projection 只由 `LocalResourceAccessService` 或 `ResourceCacheService.project()` 生成；失败时返回 diagnostic、缺省 renderable projection 或 fail closed。
- durable payload 只保存 `ResourceRef`、source ref、workspace-relative path、`${VAR}/path`、asset/entity ID 或 document locator，不保存 materialized cache path、`cachePath`、runtime path、Webview URI、blob/object URL 或 token。
- 测试断言 canonical service/provider/message/adapter 被命中，不能只断言最终图片、缩略图或预览显示成功。

## 与其他架构文档的关系

- [`unified-entity.md`](unified-entity.md) 定义实体身份、候选、绑定、需求和展示投影。
- [`asset-library.md`](asset-library.md) 定义素材库、Asset/Variant/File、导入来源和素材搜索投影。
- [`engine-runtime.md`](engine-runtime.md) 定义 Engine 对媒体、设备、ML、stream 和导出的权威边界。
- [`proto-and-wire-contracts.md`](proto-and-wire-contracts.md) 定义跨语言 wire contract 与项目格式关系。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- local resource access
- intent-aware content access
- storage strategy
- project cache search service 中的 cache/search freshness 规则
- format strategy 中的路径、引用和持久化部分
