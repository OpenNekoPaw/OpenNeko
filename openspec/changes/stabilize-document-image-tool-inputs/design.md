## Context

文档读取返回的每个 `DocumentImageInfo` 同时包含展示元数据和稳定 `resourceRef`。真实运行中 `ReadDocument` 返回了 10 个完整 document-entry refs，但模型在构造 `ReadImage` 批量参数时漏掉其中一个嵌套 `resourceRef.entryPath`；顶层展示字段仍有同名值。`ReadImage` 末端 guard 正确拒绝整本文档 archive bytes，但当前宽泛 `resourceRef: { type: object }` schema 无法在执行前指出具体损坏项。

五层边界如下：职责上 `ReadDocument` 产生稳定图片引用，Tool schema/validator 保证调用参数可形成唯一身份，ContentAccess 加载字节；依赖上 `neko-content` 定义工具契约、`neko-agent` 执行通用 schema validation；接口上接受完整 DocumentArchiveResourceRef、同项顶层路径可唯一补全的 document-entry ref，或 managed ResourceRef；扩展上其他工具可复用递归 validator；测试覆盖确定性 schema、真实 Agent Tool 路径和禁止任意重建。

## Goals / Non-Goals

**Goals:**

- 在 Tool 执行前定位 `images[n].resourceRef.entryPath` 等嵌套契约错误。
- 保持 Pi、Extension ToolRegistry 和 TUI 对同一 schema 的判断一致。
- 让模型看到可修正的 field-level validation diagnostic，并可通过现有 ReAct Tool 失败反馈重试。
- 用合成 EPUB 证明 `ReadDocument -> ReadImage -> native multimodal` 路径。
- 限制一次 ReadImage 原生多模态 continuation 的源图数量和编码字节，并让多图使用带可追溯编号的 contact sheet。
- 让用户在 Tool 卡片中看到实际选中图片的缩略图，即使结果只包含 canonical `ContentLocator`。

**Non-Goals:**

- 从其他项、locator、文件名、archive source、缓存路径、Webview URI 或整本文档字节猜测 resourceRef；同项顶层 `entryPath` 的限定规范化是唯一例外。
- 修改 ContentAccess、ResourceCache、document reader、媒体库 path 或缓存物化。
- 引入 session-local batch handle、工具结果索引或第二套文档图片访问接口。
- 让 `ReadImage` 自己调用视觉模型或返回 OCR/画面描述。
- 把 contact sheet 当作新的持久素材、派生事实或 Webview-owned 文件。

## Decisions

### 1. ReadImage resourceRef 使用 discriminated JSON schema

`images[]` 使用 sibling-aware `anyOf` 表达三个合法形状：完整 document-entry ref；同项顶层 `entryPath` 加只缺嵌套路径的 document-entry ref；完整 managed ResourceRef。managed 分支要求 `id`、`scope`、`provider`、`kind`、`source` 和 `fingerprint`。这只调整工具输入边界，不修改共享持久类型，因为 whole-document DocumentArchiveResourceRef 在其他领域仍然合法。

备选方案是要求模型把 document ref 放到新 `documentResourceRef` 字段，或让 `ReadImage` 接受 `ReadDocument` toolCallId/batch handle。前者增加一次字段转换并扩大迁移面；后者引入 session state owner。当前问题只需要把既有契约变成机器可校验 schema。

### 2. 通用轻量 validator 递归执行同一 schema

扩展 `schema-validator` 支持嵌套 object properties/required、array item schema、`anyOf` 和字符串 `minLength`。错误 field 使用 `images[7].resourceRef.entryPath` 形式。Pi 保持 TypeBox 校验，ToolRegistry 使用同一 schema 语义；不得在某一宿主旁路校验。

递归只覆盖 `ToolParameterProperty` 已声明的 JSON Schema 子集，不引入新的 schema library 或平行 validator。

### 3. Runtime guard 保留为安全边界

`restoreManagedResourceRef` 的 missing-entry guard 保留，保护绕过 schema 的直接调用和未来 adapter 漂移。ReadImage 参数解析只在嵌套 ref 已通过 `kind/source` 解析、嵌套路径缺失且同项顶层路径非空时补全一次；两处路径同时存在但不相等会在 ContentAccess 前失败。一个无法形成唯一身份的损坏项继续使整批失败，避免把部分成功误报为完整视觉分析。

### 4. Evaluation 使用合成 EPUB

在现有 Agent runtime suite 中增加提交到仓库的最小 EPUB fixture/case。hard gates 要求一次成功 ReadDocument、一次成功 ReadImage、无 runtime error、最终标记，并证明 whole-archive/fabricated ref fallback 未参与。私有漫画文件和人工 UI 操作不作为 acceptance 依赖。

### 5. Pi Tool result 原生图片由 Host loader 投影

`ReadImage` 返回的 `attachments/perceptionCards` 是原生多模态输入，不只是 UI metadata。`projectOpenNekoTool` 在保留结构化 `details` 的同时，把 image attachment 交给注入的 Host asset loader，并将返回的 data URL 严格转换为 Pi `ImageContent`。Extension 和 TUI 复用各自现有 ContentAccess-backed perception asset loader；Agent core 不读取文件、不解析 workspace path，也不感知缓存。

存在 image attachment 但缺 loader、缺稳定 assetRef、loader 返回非 image 或非 base64 data URL 时，当前 Tool 调用必须 fail-visible。不得静默退回纯文本 metadata，因为这会让模型把未见过的图片描述成分析成功。

`ReadDocument` 对外 document-entry ref 始终重绑到 stable input source；resolved absolute source 只进入内部 `loadProviderAsset` 请求，不得返回给模型或 Evaluation facts。

### 6. 显式 contentLocator 不得静默回退

`ReadImage.images[n].contentLocator` 对外发布完整的 `ContentLocator` discriminated union，而不是无约束 object。执行边界再次调用共享 `validateContentLocator`；如果调用方显式提供了该字段但验证失败，错误必须带当前图片索引并在任何 `resourceRef`、provider 或 metadata 路径执行前终止。

同一项携带多个稳定身份时，不能把无效的新 canonical identity 当作“字段不存在”并改走旧身份。该行为会掩盖 ReadDocument/模型参数漂移，并让最终错误错误地归因于 Host source resolution。调用方可依据精确 validation diagnostic 修正 locator；运行时不得从 sibling ref 猜测缺失的 workspace source/path。

### 7. Provider 图片传输使用硬预算

`ReadImage` 每次最多选择 5 个源图。Pi Tool-result bridge 在调用 provider 前强制校验最多 4 个编码 image payload、每个 payload 最多 4 MiB、整批最多 12 MiB；超过预算必须 fail-visible，不能截断后伪装成完整分析。

源图加载上限与 provider 编码预算是不同边界：ContentAccess 保护单个本地输入，Host 图片传输器负责旋转、缩放、JPEG 编码和最终 Base64 预算。单图也必须通过同一有界归一化路径，不能把原始 20 MiB 图片直接交给 provider。

### 8. 多图由 Host 生成可追溯 contact sheet

当 Tool result 含多个 image attachment 时，Pi bridge 调用 Host 注入的 batch projection，而不是逐张形成 provider image part。`storyboard`/`describe` 使用 overview sheet；`ocr`/`panels`/`custom` 使用更少图片一组的 detail sheets。每个 tile 必须带从 1 开始的顺序标签，模型可见文本 manifest 保存 `tile -> assetId/label` 映射。

contact sheet 只存在于当次 provider continuation，不写工作区、不进入 ResourceRef、不会替代 Tool result 中逐项 attachment/perception card。Host 缺少 batch 能力时，多图调用必须 fail-visible；不得静默退回无预算的逐图发送。

### 9. Webview 缩略图使用独立的 Host 投影

Tool result 的 canonical identity 仍是 `ContentLocator`/ResourceRef。Extension Host 在发送 live Tool result 和恢复历史消息时，将 image attachment 的稳定 ref 投影为小尺寸 WebP/JPEG preview data URI；该字段只属于 Webview message projection，不进入持久历史或模型输入。

Webview presenter 必须按 attachment/result index 把 preview 与 `data.images[n]` 对齐，并接受 locator-only ReadImage 结果。UI 显示实际选中的每一项及其顺序/标签；预览生成失败时保留可见占位和明确 diagnostic，不能把整项过滤消失。

## Risks / Trade-offs

- **[模型仍可能首次生成无效参数]** → schema 在执行前提供精确 field diagnostic；真实 evaluation 验证 ReAct 能修正或至少 fail-visible。
- **[递归 validator 影响其他工具]** → 保持 JSON Schema 标准语义，补通用单元测试并运行 Tool registry/Agent gates。
- **[provider 对 anyOf 支持差异]** → Pi TypeBox 和 ToolRegistry 均保留本地校验；provider schema rejection 与 runtime validation failure分别可观测。
- **[批量一个坏项导致全失败]** → 能由同项冗余身份唯一恢复时先规范化；source 缺失、路径冲突或无 entry 身份仍保持原子失败，避免用户请求 5 页却只分析 4 页而不知情。
- **[宿主未注入图片 loader]** → image attachment 使 Tool fail-visible；不返回纯文本成功，也不从 path/cache 自行读取。
- **[批量中只有后续 locator 损坏]** → diagnostic 携带 `images[n]`；整批在内容加载前失败，不用旧 ref 产出部分成功结果。
- **[拼图降低小字可读性]** → overview/detail 两种固定策略；Tool result 保留逐项引用，用户可缩小批次再次读取，不宣称 contact sheet 适合像素级 OCR。
- **[Webview 预览扩大消息体]** → 只生成小尺寸有损缩略图，live/history 投影按 locator 去重，data URI 不持久化。

## Migration Plan

1. 增加递归 schema contract 与红灯测试。
2. 收紧 ReadImage schema，保留现有 runtime guard。
3. 更新 Tool schema snapshots/localization 断言。
4. 增加合成 EPUB evaluation 并运行 key-free 与真实 case。

该工具尚未发布，不保留旧宽泛 schema。回滚只需恢复 schema/validator；没有持久数据迁移。

## Open Questions

无。
