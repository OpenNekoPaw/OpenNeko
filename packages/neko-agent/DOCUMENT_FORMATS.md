# 文档格式支持

NekoAgent 的 `ReadDocument` 用于把创作者已有资料转成 Agent 可继续处理的文本、结构和文档图片引用。实现上使用扩展内部的 TypeScript/JavaScript/WASM 解析库，不要求创作者安装 Python、unzip、sips、unrar、7z 等命令行程序。

## 必须支持的格式

这些格式会出现在 VSCode 文档动作、素材库和 `ReadDocument` 工具链中，属于 P0 支持范围：

| 类型 | 格式 | 当前读取能力 |
| --- | --- | --- |
| 常规文档 | PDF | 读取文本、页数和元数据；支持按页范围读取 |
| Office 文档 | DOC/DOCX | 读取正文；DOCX 会把内嵌图片物化到受管资源缓存并返回结构化引用 |
| 演示文稿 | PPT/PPTX | 读取幻灯片文本；PPTX 会把内嵌图片物化到受管资源缓存并返回结构化引用 |
| 表格 | XLS/XLSX | 读取工作表数据；XLSX 会把内嵌图片物化到受管资源缓存并返回结构化引用 |
| 电子书 | EPUB | 读取章节文本；图像型漫画 EPUB 会把页面图片物化到受管资源缓存并返回结构化引用 |
| 漫画档案 | CBZ/CBR | CBZ 读取图片页并按阅读顺序返回可重建文档 entry 引用；CBR 当前读取清单/页顺序，不通过临时路径暴露图片 |
| 剧本 | FDX | 读取 Final Draft 场景、动作和对白 |
| 文本剧本 | TXT/Markdown/Fountain | 读取纯文本；Markdown 会识别本地图片引用 |
| 工具输入 | HTML/URL/JSON/YAML | 读取网页或结构化文本；HTML/URL 会识别图片引用 |

## 创作者可预期行为

- 图像型 EPUB、CBZ 以及 DOCX/PPTX/XLSX 内嵌图片会返回 `imageInfo`，包含宽高、MIME 类型、字节大小、文档 locator、alias/aliasScope，以及可用于跨包传递和缓存重建的稳定 `resourceRef`。Canvas、分镜和 composite artifact 必须使用结构化引用，不依赖缓存路径。CBR 在统一容器 entry provider 支持前不会返回不可重建的临时图片路径。
- 文本型 EPUB、PDF、DOCX、FDX、Markdown 等会优先返回 `text`，并在可用时附带 `metadata`。
- 大文档优先使用 `mode: "manifest"` 查看结构，再用 `mode: "range"` 读取指定页、章节、幻灯片或文本范围。
- 如果 `mode: "range"` 没有传入 `range`，工具会基于 manifest 读取开头一段，图片数量受 `max_images` 限制，避免创作者只想预览时误触发整本读取。
- `ReadDocument` 不负责直接读取单张 `.jpg/.png/.webp` 图片文件；图片分析应使用图像类工具。

## 图片能力边界

图片路径提取是按格式能力提供的：

| 格式 | 图片处理 |
| --- | --- |
| EPUB | 解析章节 HTML 中的图片引用，并从 EPUB 包内物化受管资源 |
| CBZ | 从 ZIP 包内按文件名自然排序物化受管资源 |
| CBR | 读取清单和页顺序；不通过临时 scratch 路径暴露图片，后续由统一容器 entry provider 接管图片物化 |
| DOCX/PPTX/XLSX | 从 Office Open XML 包的 media 目录物化内嵌图片受管资源 |
| HTML/Markdown/URL | 返回文档中出现的图片引用 |
| PDF | 当前读取文本层；扫描版或纯图片 PDF 需要后续接入渲染/OCR 后端 |

图片基础元数据由内部 TypeScript 头部解析器生成，覆盖 JPEG、PNG、WebP、GIF、BMP。Skill 应直接使用 `ReadDocument.imageInfo` 判断分辨率、页比例和格式，不应调用 Python/PIL、系统 `file`、`sips`、`identify` 等外部命令补探测。

## ZIP/容器资源引用策略

EPUB、CBZ、CBR、DOCX、PPTX、XLSX 这类文件本质上是容器文档。当前策略是“原始容器只读、图片由统一 documents 资源缓存透明物化、操作携带结构化引用”。解析库可以枚举 entry、章节和文本结构；图片或其它二进制 entry 字节必须经 Engine-backed entry reader 读取，再由统一 `ResourceCacheService` 按 documents 缓存规则物化。尚未接入统一 entry provider 的容器格式必须 fail-visible 或只返回清单/文本，不允许通过临时路径伪装成可缓存资源：

- 不注册 `zip://`、`epub://` 等 VSCode 虚拟路径作为主数据通道。VSCode Webview、Canvas `<img>`、ReadImage 和文件跳转都需要可授权的实体路径或明确的 Extension Host 命令，虚拟路径容易在 Webview CSP、粘贴、调试和跨插件传递中断开。
- Agent、Skill、Webview presenter、Canvas 传递和 artifact 不能感知或保存缓存路径。`imageInfo.path`、`imagePaths`、`runtimeImagePaths`、`runtimePath`、`cacheResourceRef`、`runtimeKind` 和旧 `cachePath` 不属于公开工具合约；若旧数据里出现这些字段，转发前必须剥离。
- `imageInfo.resourceRef` 表示原始容器来源，包含 `source`、容器内 `entryPath` 和可选 `locator`。统一缓存服务会在需要读取、预览或传递时把它转换成内部 `ResourceRef` 并按 documents 缓存规则物化。
- documents 缓存路径由统一资源缓存服务管理，形态为 `.neko/.cache/resources/documents/doc_<stableRefHash>/<contentMd5>.<ext>`，按内容 MD5 去重，manifest 可重建。无工作区时使用 extension-private resource cache，但会标记为不可跨项目持久传递。
- `.neko/.runtime/document-reader`、extension `globalStorageUri/runtime/document-reader` 和 `/tmp/neko_epub_*` / `/tmp/neko_cbz_*` 这类旧 document-reader scratch 目录已经废弃。正常 `ReadDocument`、`ReadImage`、Canvas/Preview 传递和 Agent 工具结果都不应创建、返回或依赖这些路径；若日志中出现，视为残留实现或迁移 bug。
- 工具引用 JSON 使用 `protocolVersion: 2` 时，durable body 只包含结构化引用；当前 Webview 需要展示的 `renderUri`/`src` 只存在于 Host 投影后的消息或组件状态，不能写入复制引用、Canvas 或 Storyboard 图片身份。
- 粘贴时如果只有路径，Agent 只能把它当作普通本地文件；如果 JSON 引用里带 `resourceRef`，Agent 可以继续跳转、定位 entry、解释来源，并通过统一缓存服务重新物化缺失缓存。
- 跳转到资产库或文档索引页应使用 `navigationData` 中的 `source/filePath/entryPath`，由 Extension Host 或对应资源库命令解析；不要尝试让 Webview 直接打开容器内虚拟文件。

重新打包不做原地修改。后续写回或替换容器内图片时，应生成带版本的新导出文件，例如 `comic.v2.epub` 或工作区管理的导出副本，再把引用切换到新 `DocumentSourceRef` / `entryPath`。`versionPolicy: "versioned-export"` 表示当前引用遵循这种版本化导出策略；旧缓存路径或旧 scratch 路径只能作为拒绝/诊断/迁移输入，不能作为成功读取或长期数据源。

## 分镜和 Canvas 传递

- 分镜表、`neko-composite`、Send to Canvas 和 Canvas 节点数据应使用 `sourceMediaRefs`、`referenceResourceRef`、`referenceImageResourceRef`、`documentResourceRef` 或 `resourceRef` 表达图片身份。
- `sourceMediaRefs[].locator.type` 应引用真实工具结果，例如 `{ "type": "tool-result", "toolCallId": "...", "assetIndex": 0 }`。`sourcePage: "P1"`、`sourceImage: "page_1"` 这类可读字段只是 scoped alias，必须能映射到同一批工具结果。
- 多次读取不同文件时，`page_1` 不是全局唯一标识；必须结合 `toolCallId`、`aliasScope`、源文档或批次判断。不能把第一批 `page_1` 自动绑定给后续所有分镜。
- 不要把 `.neko/.cache` 下的运行时缓存路径、VS Code globalStorage 运行缓存路径、Webview URI、blob/object URL、绝对本地 scratch 路径或旧 `cachePath` 写入 `referenceImagePath` 作为新 Canvas 传递身份。即使路径当前在 `.neko/.cache/resources` 内，长期交接也要保存 `ResourceRef`，不能保存实体路径。
- 当语义分镜表已经有效但图片别名存在歧义或工具结果缺失时，Agent 仍可把文字分镜结构发送到 Canvas；发送前必须移除 `page_1`、旧 scratch/cache 路径、Webview/blob/file URI 等不可携带的 `referenceImagePath`，并在 Webview 展示诊断。
- 实时预览可以走统一资源缓存和 Webview 投影；离线导出、打包、校验必须回到原始 source/locator 或可复建的 project resource ref，不能复制 preview/scratch 缓存文件。

## 外部处理器与诊断

图片、视频、音频或脚本类外部工具必须通过 External Processor manifest 暴露。普通创作 Agent 不默认注入任意 `Bash`/shell；Developer Mode 的一次性命令也会走同一 processor policy。Processor 输出默认进入 `.neko/.cache/resources` 或无工作区时的 extension `globalStorageUri/resources`，返回 `ResourceRef`、provenance 和 diagnostics，不返回裸绝对路径作为 durable output。

常见诊断含义：

| code | 含义 |
| --- | --- |
| `missing-executable` | executable 未配置、未解析为绝对 Host 路径，或位于 temp/Downloads/Desktop 等禁止位置 |
| `blocked-env-key` / `unknown-env-key` | env 不在 allowlist，或命中 token/secret/SSH/cloud credential denylist |
| `unauthorized-path` / `invalid-cwd` | input/output/cwd 不在 workspace、mediaLibrary、resourceCache 或 extensionPrivateResources 的授权 root 内 |
| `network-policy-unavailable` | manifest 要求关闭网络，但当前 runner 无法证明网络隔离 |
| `non-portable-output` | 输出 path hint 或结果不能收缩到受管 root，不能跨包保存 |
| `disabled-processor` / `untrusted-processor` | processor 被用户、policy、Market entitlement/revocation 或 trust gate 禁用 |
| `missing-output` | processor 完成但声明 output slot 没有产生文件，或缓存 variant 已被 GC 标记 missing |

## 结构化读取

`ReadDocument` 保留全文读取模式，也支持结构化模式：

```typescript
await readDocument({
  source: { kind: 'file', path: '${A}/book.epub' },
  mode: 'manifest',
});

await readDocument({
  source: { kind: 'file', path: '${A}/book.epub' },
  mode: 'range',
  range: { locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 } },
  max_images: 10,
});

await readDocument({
  source: { kind: 'file', path: '${A}/book.epub' },
  mode: 'next',
  cursor,
});

const pageImages = result.imageInfo ?? [];
await readImage({ images: pageImages });
```

预览面板传入的 `ContentSourceRef`、`DocumentLocator` 和 excerpt 可以让 Agent 从同一页、同一章或同一条目继续，而不是重新读取并截断整个文件。文档图片必须通过 `ReadDocument.imageInfo[].resourceRef` 传给 `ReadImage.images[]`；不要传缓存路径、EPUB entry path、整本文档 source 或 Webview URI。

## 法律与版权边界

NekoAgent 只处理 DRM-free 内容：

- DRM 保护的 EPUB/PDF 会被拒绝。
- 用户必须拥有文件的合法使用权。
- 本工具只做本地处理，不分发内容，不绕过 DRM。
- 不支持盗版内容、未授权分发或规避版权限制的用途。

## 已知限制

- 超大文件可能带来性能压力，优先用 manifest/range 分段读取。
- 复杂 PDF 版式可能只得到文本层结果；扫描版 PDF 没有 OCR 文本时暂不能提取正文。
- 密码保护文件不支持。
- 文档图片公开读取结果只暴露结构化 `resourceRef` 和语义元数据。缓存物化、去重和重建由统一 documents resource cache 完成；agent/platform 业务层不创建、不读取、不返回 document-reader scratch 目录。

## 开发者实现说明

- 格式解析集中在跨领域 domain service `@neko/content/document`，Extension 工具层只负责参数、schema 和结果适配。
- `@neko/content/document` 不决定缓存目录，也不直接读取容器图片字节作为成功路径；它只产出 `DocumentArchiveResourceRef`、locator 和元数据，二进制 entry bytes 由 Extension 注入的 Engine file access 读取。
- 运行时依赖通过 `DocumentReaderRuntimeDeps.loadModule()` 注入，保持平台层可测试，不直接依赖 VSCode API。
- 不通过 shell 调用外部解析程序；禁止把 Python、系统 `unzip`、`sips`、`unrar` 等命令作为生产读取路径。
- 新增格式时先扩展共享契约和 manifest/range 能力，再补具体解析器和单元测试。

当前内部库包括 `pdf-parse`、`mammoth`、`officeparser`、`epub2`、`adm-zip`、`node-unrar-js`、`node-fetch`、`cheerio`、`xlsx`、`fast-xml-parser`。这些是扩展构建依赖，不应出现在创作者操作说明里。

## 相关工作流

- Document -> Script -> Video：读取文档文本，生成剧本，再转换为视频时间线。
- Comic -> Storyboard -> Video：读取漫画页图片，做视觉分析，再生成分镜和视频。

参考：

- [neko-agent 架构](./ARCHITECTURE.md)
- [系统架构总览](../../ARCHITECTURE_CN.md)
