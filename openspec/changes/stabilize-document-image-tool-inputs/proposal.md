## Why

`ReadDocument` 能返回完整的文档图片引用，但 Agent 在把多条 `imageInfo` 复制到 `ReadImage` 参数时可能遗漏嵌套 `entryPath`。当前 tool schema 无法在调用前识别这种单项损坏，导致一个无效引用使整批 EPUB/PDF/CBZ 图片分析失败。

## What Changes

- 为 `ReadImage.images[].resourceRef` 定义可校验的 ResourceRef/document-entry JSON schema；document-entry 在该工具边界必须包含稳定 `entryPath`。
- 保留运行时 fail-visible 校验；仅当同一 `imageInfo` 项保留非空顶层 `entryPath` 且嵌套 document-entry ref 只缺该字段时，在 ReadImage 唯一输入边界规范化。两处路径冲突、source 损坏、locator/文件名/cache/Webview URI 或整本文档 source 不得用于修补。
- 当 provider/model 产生不符合 schema 的 Tool 参数时，复用现有 Agent tool-validation/recovery 路径；不得把失败伪装为成功或降级读取整本文档字节。
- 修正 `ReadDocument` 图片投影，使公开 document-entry ref 保持 workspace-relative source；物理路径只用于 ContentAccess 内部加载。
- 让 Pi Tool bridge 把成功 `ReadImage` 的稳定 image attachment 经 Host 注入的现有 perception asset loader 转成原生 image content；不得只把图片元数据文本交给模型。
- 增加合成 EPUB 的确定性 contract 测试与真实 Agent evaluation，证明 `ReadDocument -> ReadImage -> native multimodal` canonical path，并 poison whole-archive/fabricated-ref fallback。

## Capabilities

### New Capabilities

- `document-image-agent-access`: 文档图片从 `ReadDocument.imageInfo` 到 `ReadImage` 的稳定引用契约、批量校验、失败恢复和 Agent 路径证据。

### Modified Capabilities

无。

## Impact

- `packages/neko-content` 的 `ReadImage` tool schema、参数解析和 contract 测试。
- `packages/neko-agent` 的 Tool schema bridge、validation/recovery、Tool-result image projection 与宿主 loader 注入。
- `scripts/agent-eval` 的合成文档 fixture、suite case、runtime facts 和 hard gates。
- ContentAccess、ResourceCache、document reader、workspace path 或媒体库 link contract 不因该输入规范化改变。
