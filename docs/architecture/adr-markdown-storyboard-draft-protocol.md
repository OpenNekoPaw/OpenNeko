# ADR: Markdown 分镜草稿与标准 StoryboardTable 协议边界

状态：Superseded by Canvas Markdown capabilities
日期：2026-06-28
范围：`neko-agent`、`neko-canvas`、`neko-cut`、`neko-preview`、`neko-content`、`@neko/shared`、StoryboardTable、CompositeArtifact、Markdown 渲染、统一内容访问和 Canvas/Cut 交接。

本文记录 OpenNeko 对 Markdown 分镜表、轻量草稿协议和标准 StoryboardTable 的边界决策。它补充 [`agent.md`](agent.md)、[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、[`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md) 与 [`proto-and-wire-contracts.md`](proto-and-wire-contracts.md)，用于解决“模型生成完整 JSON 协议慢，但 Markdown 表格缺少稳定资源和跨工具 contract”的问题。

> 2026-06-29 更新：本 ADR 的固定 storyboard draft 分层以及后续 `@neko/draft-runtime` 方案都已被 [`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md) 取代。当前 canonical path 是 Canvas MCP-like Markdown capabilities：Agent 输出 Markdown 与意图，Agent Webview 做 presentation-only 增强渲染，Canvas 拥有校验、资源绑定、节点创建和 follow-up actions。本文中的 `@neko/storyboard-draft`、`@neko/draft-runtime`、`CreativeDraftDocument` 和固定 `StoryboardDraftNormalized` 建议仅作为历史背景，不再作为新实现入口。

## 背景

漫画、图片序列和分镜规划场景中，模型直接生成完整 `CompositeArtifact` + `StoryboardTable` JSON 有明显成本：

- token 多，生成慢，容易在长表中破坏 JSON 结构。
- 用户审阅成本高，不如 Markdown 表格直观。
- 模型容易发明 `toolCallId`、图片文件名、路径或旧字段来填充复杂协议。
- 分镜早期常处于草稿状态，用户更关心镜头语义，而不是完整 domain contract。

同时，单纯让 Markdown 表格成为跨工具协议也会引入风险：

- Markdown 单元格没有类型约束，`duration`、`shotId`、`sceneId`、`imageStrategy` 和 `sourceMediaRefs` 都可能缺失或歧义。
- 表格中的 `read-image-cover.jpg`、`page_1`、`cover` 等只是用户可读 token，不是稳定 `ResourceRef`。
- Canvas/Cut/Preview/生成工具如果直接消费 Markdown，会重复实现解析、补全和图片绑定逻辑。
- Markdown 不能作为项目事实或跨领域命令 payload 的唯一标准，否则会破坏协议验证、诊断和迁移。

因此需要一个中间层：允许模型高效输出 Markdown 草稿，同时由本地代码将它规范化、诊断、绑定资源，并在需要进入生产流程时编译为标准 `StoryboardTable`。

## 决策

OpenNeko 采用三层分镜表示：

| 层级 | 生成者 | 主要用途 | 是否可作为跨工具生产协议 |
| --- | --- | --- | --- |
| `MarkdownStoryboardDraft` | Agent / 用户 | 快速生成、展示、编辑、对话参考 | 否 |
| `StoryboardDraftNormalized` | 本地 normalizer | 字段补全、图片 token 绑定、诊断、局部修复输入 | 否 |
| `StoryboardTable` / `CompositeArtifact` | 本地 compiler 或经过验证的 Agent 输出 | Canvas/Cut/Preview/生成/导出标准输入 | 是 |

Markdown 表格是 authoring shorthand，不替代标准协议。Canvas 可以渲染 Markdown 分镜草稿，也可以把它作为下一步工具调用的参考依据；但任何会改变领域事实、创建 Canvas 分镜节点、进入 Cut timeline、批量生成媒体或导出生产包的动作，必须先把 Markdown 草稿转换并校验为标准 `StoryboardTable`。

## 轻量草稿格式

系统应支持至少一种低 token 的草稿输入：

```md
## Scene: 巨构城市开场

| id | source | scene | shot | duration | visual | motion | audio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 001 | cover | 封面构图 | 中远景 | 4s | 主角置身冷硬巨构空间 | 缓慢推进 | 低频机械嗡鸣 |
| 002 | page_1 | 静态信息页 | 静态 | 2s | 卷首信息页，形成阅读节奏缓冲 | 轻微呼吸 | 环境底噪 |

## Scene: 管线深处

| id | source | scene | shot | duration | visual | motion | audio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 003 | page_2#panel_1 | 管线深处 | 大远景 | 5s | 巨型建筑和管线压迫画面，人物极小 | 横移 | 深层空间风声 |
| 004 | page_2#panel_2 | 管线深处 | 特写 | 3s | 人物回头观察阴影中的动静 | 快速推近 | 金属摩擦声 |
```

也可以支持 fenced draft block：

````md
```neko-storyboard-draft
001 | cover | 封面构图 | 中远景 | 4s | 主角置身冷硬巨构空间 | slow push-in | low mechanical hum
002 | page_1 | 静态信息页 | 静态 | 2s | 卷首信息页 | hold | ambience
```
````

草稿字段命名可以本地归一化，例如：

| Canonical 字段 | 可接受别名 |
| --- | --- |
| `id` | `shot id`、`shotId`、`镜头`、`镜头编号` |
| `source` | `image`、`source image`、`来源页`、`来源图` |
| `scene` | `scene`、`场景`、`段落` |
| `shot` | `shot`、`景别`、`镜头类型` |
| `duration` | `time`、`时长`、`秒数` |
| `visual` | `visual`、`画面内容`、`画面`、`描述` |
| `motion` | `camera`、`镜头运动`、`运动` |
| `audio` | `sound`、`voice`、`氛围/声音建议` |
| `dialogue` | `对白`、`台词` |
| `prompt` | `generation prompt`、`生成提示词` |

Normalizer 可以增加字段别名，但不能让下游领域直接解析各自的 Markdown 方言。

实现约束：

- Normalizer 必须按阶段组织为 parser、column mapper、row normalizer、resource binder、compiler，不得堆成一个跨语法的大正则集合。
- 字段别名表应是可测试的数据表；新增别名必须有中英文解析测试。
- Markdown table 和 fenced draft block 如果同时支持，必须先归一化为同一种 `DraftRowTokenStream`，后续流程不得维护两套业务转换路径。
- 若 fenced block 无表头，必须使用固定列序和明确 version/profile；否则返回 diagnostic，不做猜测解析。

`DraftRowTokenStream` 是 syntax parser 与业务 normalizer 的边界。它不应暴露 Markdown AST，也不应直接包含 StoryboardTable 字段：

```ts
interface DraftRowTokenStream {
  readonly sourceFormat: 'markdown-table' | 'tsv' | 'fenced-block';
  readonly profile?: string;
  readonly headings: readonly DraftHeadingToken[];
  readonly tables: readonly DraftTableToken[];
  readonly diagnostics: readonly StoryboardDraftDiagnostic[];
}

interface DraftTableToken {
  readonly tableId: string;
  readonly headingRef?: string;
  readonly headers: readonly string[];
  readonly rows: readonly DraftCellToken[][];
}
```

后续 column mapper 只消费 token stream、headers 和 cell text。这样 fenced block、Markdown table 和 TSV 可以共享同一条 column/row/resource/compiler 链路。

### 场景分组与多表

一个文档、EPUB、CBZ、PDF 或图片序列可能产生多个叙事场景。Markdown 草稿允许以下分组方式：

- 一个 Markdown 回复中包含多个表格，每个表格前用标题表达 scene，例如 `## Scene: ...`、`### P1-P3 城市开场`。
- 一个表格内使用 `scene` / `sceneId` / `sceneTitle` 列表达场景分组。
- 一个 fenced `neko-storyboard-draft` block 中使用空行、`# scene` 行或 `scene:` 行分段。

Normalizer 必须把这些分组规范化为 `StoryboardTable.scenes[]`：

- 同一表格标题下的行默认归入同一个 scene。
- 同一表格内 `scene` 值连续相同的行归入同一个 scene。
- `sceneId` 优先来自显式 `sceneId` 列或已存在 binding；没有显式 id 时可由标题、scene 列和出现顺序生成，但必须标记为 derived id。
- `shotNumber` 是跨所有 scene 的全局顺序；每个 scene 内可以保留局部顺序 metadata，但不能替代全局顺序。
- 如果 Markdown 没有明确 scene 分组，本地 normalizer 可以按连续来源页、标题和语义段落生成默认 scene；不确定时生成 diagnostic，而不是把所有行静默塞进一个 scene。

场景 ID 稳定性规则：

- 一旦草稿转换为标准 `StoryboardTable` 并被 Canvas/Cut 引用，后续编辑应保留既有 `sceneId` / `shotId`。
- 用户改标题不应自动改 id；标题变化是 rename，不是删除重建。
- 若 Markdown 草稿没有显式 id，系统可在 normalized draft 中写入 hidden binding 或 draft metadata，用于下次转换复用。
- 如果无法判断某个 scene/shot 是 rename、move 还是新建，必须生成 diagnostic，请用户确认或由 Agent 局部修复。
- 任何会导致下游 Canvas 节点、Cut timeline 或 entity binding orphan 的 id 变更，都必须可见，不得静默重建。

Hidden binding 的存储位置按生命周期区分：

| 生命周期 | 存储位置 | 说明 |
| --- | --- | --- |
| Chat 消息草稿 | message/composite projection metadata | 会话级草稿状态，可随消息恢复；不是项目事实 |
| Canvas Markdown 草稿节点 | node metadata | Canvas 内可继续编辑、转换和 disambiguate |
| 标准 StoryboardTable | `sceneId` / `shotId` / `sourceMediaRefs` | 已编译为生产协议，不再依赖 hidden binding |

Hidden binding 是草稿到标准协议的桥，不应写入 cache manifest、Webview URI、cache path 或 provider-private payload。若用户把草稿正式保存为项目事实，应保存标准 `StoryboardTable` 或带 metadata 的 Canvas 草稿节点，而不是只保存无法复用的纯 Markdown 文本。


### 图片与分镜不是一对一

Markdown 草稿必须支持图片与 shot 的多对多关系：

| 关系 | 示例 | 规范化结果 |
| --- | --- | --- |
| 一张图片拆成多个 shot | `page_2#panel_1`、`page_2#panel_2` | 多个 shot 引用同一个 `sourceMediaRefs[].documentResourceRef`，并在 label/metadata 记录 panel/crop |
| 多张图片组成一个 shot | `page_3+page_4`、`P3,P4` | 一个 shot 的 `sourceMediaRefs[]` 包含多个来源 |
| 多个 shot 共享同一整页图 | 同一页有 3 个漫画分格 | 每个 shot 都引用同一页图，但用 `extensions["neko.comicImageAudit"]` 或 ref metadata 标明 panel index |
| 一个 shot 没有直接图源 | 过渡字幕、旁白、黑场 | 允许无 `sourceMediaRefs`，但 `imageStrategy` 不得是 `reuse-original` / `use-as-reference` / `transform-original` |

因此，Normalizer 不得按行号把第 N 行强行绑定到第 N 张图片，也不得假设每张图片只能生成一个分镜。`source` 字段表达的是来源证据 token 或来源组合，不是数组下标。若一个 token 对应整页图且行内声明了 `panel_2`、`left-top`、`crop(...)` 或其他 panel 线索，编译器应把整页 `resourceRef` 写入 `sourceMediaRefs`，并把 panel 线索写入 metadata；只有真实裁切工具返回后，才能把裁切图写入 generated/prepared media ref。

## 资源绑定

Markdown 草稿中的图片字段是资源 token，不是路径。允许的 token 例子：

- `cover`
- `page_1`
- `P1`
- `image_3`
- `moe-010564`
- `read-image-cover.jpg`
- `page_2#panel_1`
- `page_3+page_4`
- `P3,P4`

解析规则：

1. Webview/Agent presenter 从当前消息、相邻工具结果和统一内容访问投影建立 `StoryboardImageTokenIndex`。
2. 索引项只能来自结构化数据：`ReadDocument.imageInfo[].resourceRef`、`ReadImage.images[].resourceRef`、统一内容访问 `ResourceRef`、已验证的 generated asset ref。
3. token 解析成功后输出稳定 `documentResourceRef` 或 `resourceRef`，并保留 label、mimeType、尺寸和来源页摘要。
4. 组合 token 先拆成多个 source token，再分别解析；panel/crop 后缀只作为 metadata，不改变原始图片身份。
5. token 多义、缺失或指向不支持媒体时，生成 diagnostic；不得按行号、文件名路径、cache path、Webview URI 或 EPUB entry path 强行读取。
6. Agent 和 Canvas 不感知 cache 目录、manifest、materialized path、Webview URI 或 provider-private payload。

### Token 多义交互

Token 多义不是 Agent 可以自行猜测的错误。实现必须提供可回写的 disambiguation flow：

```text
ambiguous token diagnostic
  -> UI candidate picker or Agent local repair request
  -> selected resource binding
  -> normalized draft patch
  -> compiler retry
```

多义诊断至少包含：

- token 原文。
- 匹配到的候选数量。
- 每个候选的安全摘要：label、页码/entry label、source title、dimensions、mimeType、tool result id 或 stable source id。
- 不包含 cache path、Webview URI、绝对路径或 provider-private payload。

选择结果不得只保存在 UI 临时状态中。它必须回写到 normalized draft 的 resource binding 或显式 source token mapping 中，使再次 Send to Canvas、修复或导出时不重新进入同一歧义。

Agent 局部修复只能接收 diagnostics 和候选安全摘要。若修复结果仍不能唯一绑定，继续 fail-visible，不得回退到行号顺序或最近图片。

Disambiguation 回写通过 patch contract 进入 normalizer，不由 UI 直接改 compiler 内部状态：

```ts
type StoryboardDraftPatch =
  | {
      readonly kind: 'bind-resource-token';
      readonly token: string;
      readonly binding: StoryboardDraftResourceBinding;
    }
  | {
      readonly kind: 'preserve-identity';
      readonly draftRowId: string;
      readonly sceneId?: string;
      readonly shotId?: string;
    };

interface DraftPatchApplier {
  applyDraftPatch(
    draft: StoryboardDraftNormalized,
    patch: StoryboardDraftPatch,
  ): StoryboardDraftNormalized;
}
```

UI picker、Agent 局部修复和单元测试都必须走同一个 patch applier。这样可以证明“选择一次后 retry 不再歧义”，也避免 Canvas 和 Agent Webview 各自维护私有 disambiguation 状态。

## 转换与修复策略

Markdown 草稿转换按以下顺序执行：

```text
MarkdownStoryboardDraft
  -> parse rows and columns
  -> normalize fields
  -> bind resource tokens
  -> auto-fill mechanical fields
  -> produce diagnostics
  -> optionally request local/user/Agent repair
  -> compile StoryboardTable
```

本地 normalizer 优先修复机械问题：

- 标准化列名。
- 解析 `duration`。
- 生成稳定 `sceneId`、`shotId` 和全局 `shotNumber`。
- 基于已绑定资源填充一个或多个 `sourceMediaRefs`。
- 将多个 Markdown table、scene 标题或 scene 列分组编译为多个 `StoryboardTable.scenes[]`。
- 保留一图多 shot、多图一 shot 和 panel/crop 线索，不用图片顺序覆盖分镜顺序。
- 在可明确推断时填充默认 `imageStrategy`，例如有 source 图且没有生成图时使用 `use-as-reference`。
- 将 `source`、`visual`、`motion`、`audio`、`dialogue` 投影到标准字段和 `extensions`。

只有无法机械确定的问题才交给局部修复：

| 问题 | 默认处理 |
| --- | --- |
| 列名不标准但可识别 | 本地修复 |
| duration 格式不同 | 本地修复 |
| 缺 `shotId` / `sceneId` | 本地生成 |
| image token 可唯一匹配 | 本地绑定 |
| image token 多义 | 用户选择或 Agent 局部修复 |
| 某行缺少画面内容 | Agent 局部补全或用户编辑 |
| 表格不是分镜 | 保留 Markdown，不转换 |
| 表格严重错乱 | 询问用户或让 Agent 整表重生成 |

默认优先修复，不优先整表重生成。整表重生成只在结构不可恢复、图片与语义完全错位、大量关键字段缺失或用户明确要求时使用。

## Normalizer 复杂度控制

Storyboard draft normalizer 是本 ADR 的核心风险点。实现必须保持可分层、可诊断、可测试：

| 阶段 | 输入 | 输出 | 失败方式 |
| --- | --- | --- | --- |
| Syntax parser | Markdown table / fenced block / TSV | row token stream | syntax diagnostic |
| Column mapper | headers / fixed profile | canonical column map | unknown/missing column diagnostic |
| Row normalizer | row token stream | draft rows | missing required field diagnostic |
| Resource binder | draft rows + token index | resource bindings | missing/ambiguous/unsupported diagnostic |
| Compiler | normalized draft | StoryboardTable | contract diagnostic |

每个阶段都是纯函数，单独测试。实现不得让 Canvas、Agent Webview 或 Cut 各自调用不同解析器；领域 UI 只消费 normalized draft、diagnostics 和 compiled `StoryboardTable`。

初始实现建议优先支持标准 Markdown table + 列名别名归一化。`neko-storyboard-draft` fenced block 可作为后续增强；若引入，必须有 profile/version 和固定列序测试。


## 人物证据与统一实体关联

Markdown 分镜草稿可以记录人物形象和角色线索，但不能直接写入统一实体事实。人物关联分成两个阶段：

| 阶段 | 产物 | 责任 |
| --- | --- | --- |
| 分镜草稿/分镜协议阶段 | shot-local character evidence | 记录镜头内可见人物、外观、动作、表情、对白说话者和来源图证据 |
| 统一实体阶段 | entity candidate / binding / confirmed entity fact | 匹配已有实体、聚类同一视觉身份、生成候选、等待用户确认、写入统一实体事实 |

推荐流程：

```text
ReadDocument / ReadImage
  -> Agent 视觉分析
  -> MarkdownStoryboardDraft
      记录临时人物标签和外观证据
  -> StoryboardDraftNormalizer
      保留人物字段、source token 和 panel 证据
  -> StoryboardTable compiler
      写入 shot.characters / textCues / sourceMediaRefs
  -> Entity Evidence Extractor
      从 StoryboardTable 提取候选证据
  -> Unified Entity Service
      匹配、聚类、候选、用户确认、绑定
```

Markdown 草稿允许使用轻量字段：

```md
| shot | scene | source | characters | visual | dialogue |
| --- | --- | --- | --- | --- | --- |
| 001 | 巨构城市 | page_1#panel_1 | 主角：黑色紧身服、短发、背负长枪 | 主角穿过管线空间 |  |
| 002 | 巨构城市 | page_2#panel_3 | 少女A：短发、白色外套、神情紧张 | 少女A回头看向阴影 | “谁在那里？” |
```

转换为标准 `StoryboardTable` 时：

- `characters` 列进入 `shot.characters[]`，作为 shot-local evidence。
- 人物名、临时标签、外观描述、动作、表情和连续性线索只能作为证据，不表示已确认项目实体。
- 可见对白通过 `textCues[]` 记录，能判断说话者时填写 `speakerName`；只有已有确认绑定时才填写稳定 `speakerCharacterId`。
- 来源图、panel/crop 和 shot id 必须保留，供后续实体候选追溯。
- 若用户已明确指定“这是实体 X”或已有绑定证据，compiler 可以写入 binding reference；否则只能写候选 evidence。

统一实体服务在 `StoryboardTable` 之后处理：

- 提取跨 shot 的人物出现、外观、服装、道具、对白和来源图证据。
- 将同一视觉身份聚类为候选，而不是在分镜生成时直接确认。
- 与已有 `CreativeEntity` / entity binding 做相似度和规则匹配。
- 生成 `EntityMemoryContribution`、`EntityCandidate` 或等价 review payload。
- 用户确认后才写入统一实体事实和绑定记录。

Agent 不得在 Markdown 分镜草稿阶段直接把临时人物写成 confirmed entity，也不得为了加速分镜生成跳过用户确认。分镜转换失败不应阻塞人物证据展示，但未转换为标准 `StoryboardTable` 前，不应触发正式实体绑定写入。

## Webview Markdown 图片扩展渲染

Agent Chat Webview 应支持对 Markdown 分镜表进行安全的图片增强渲染。该能力只属于展示层和草稿交互层，不改变 Markdown 不是生产协议的决策。

Markdown 表格中允许出现图片 token，例如：

```md
| Shot ID | 来源页 | 景别 | 画面内容 |
| --- | --- | --- | --- |
| BLAME-001 | read-image-cover.jpg | 中远景 | 主角置身冷硬巨构空间 |
| BLAME-002 | page_1 | 静态信息页 | 卷首信息页，形成节奏缓冲 |
| BLAME-003 | page_2#panel_1 | 大远景 | 巨型建筑和管线压迫画面 |
| BLAME-004 | page_3+page_4 | 转场 | 跨页连续动作形成一次镜头 |
```

Webview Markdown renderer 可以把 `read-image-cover.jpg`、`page_1` 等 token 展示为缩略图 chip、内联 preview 或带诊断的 resource badge，但必须通过统一资源绑定索引解析：

```text
Markdown cell token
  -> StoryboardImageTokenIndex
  -> stable resourceRef/documentResourceRef
  -> Webview resource projection
  -> thumbnail/preview UI
```

渲染规则：

- 只识别当前消息上下文、相邻工具结果或明确传入的 resource binding index 中的 token。
- 只渲染已解析到 stable `resourceRef` / `documentResourceRef` 的图片。
- Webview renderer 不读取文件系统、不访问 cache root、不解析 EPUB entry path、不调用 Engine、不拼接 Webview URI。
- `renderUri`、缩略图 URL 或 VS Code `asWebviewUri()` 只来自 Host/Webview resource projection，不能写回 Markdown、Canvas payload 或项目事实。
- token 无法解析时保留原文本，并显示轻量 diagnostic；不能静默显示空白或把单元格改成 `-`。
- token 多义时显示冲突状态，并提供“选择资源/修复草稿”入口；不能按行号或最近图片猜测。
- `page_2#panel_1` 这类 panel token 渲染为同一页缩略图 + panel badge；没有真实 crop 前不能显示为独立裁切图。
- `page_3+page_4` 或 `P3,P4` 这类组合 token 渲染为缩略图组；转换时生成多个 `sourceMediaRefs`。
- Markdown 图片增强渲染不得作为 Send to Canvas/Cut 成功条件。生产动作仍必须通过 normalizer/compiler 生成标准 `StoryboardTable`。

建议 renderer 输出形态：

| token 状态 | UI 表现 | 后续动作 |
| --- | --- | --- |
| unique match | 缩略图 + label/resource badge | 可参与草稿转换 |
| ambiguous | 冲突 badge + 候选数量 | 用户选择或 Agent 局部修复 |
| missing | 原文本 + missing diagnostic | 修复 token 或重新绑定 |
| unsupported | 原文本 + unsupported diagnostic | 保留草稿，不进入生产流程 |

该能力应作为 Webview Markdown renderer 的可选 extension/plugin 实现，核心 Markdown 渲染仍保持通用。表格识别、token 提取和资源绑定 helper 应放在共享层，避免 Agent Webview、Canvas Webview 和 Preview 各自维护一套解析规则。

## 转换失败语义

Markdown 无法转换为标准协议时，必须 fail-visible，但保留 Markdown 可用：

- Markdown 仍可作为 Chat/Canvas 的草稿、说明、参考和可编辑 note。
- 不能发送到 Canvas 作为标准分镜节点。
- 不能发送到 Cut timeline、批量生成媒体、绑定实体、执行导出或写入项目事实。
- UI 必须显示 diagnostics，并提供“保留草稿”“尝试修复”“手动映射资源/字段”等入口。

建议状态模型：

```ts
type MarkdownStoryboardState =
  | { status: 'draft'; markdown: string }
  | { status: 'diagnostic'; markdown: string; diagnostics: StoryboardDraftDiagnostic[] }
  | { status: 'convertible'; draft: StoryboardDraftNormalized }
  | { status: 'standard'; storyboardTable: StoryboardTable };
```

转换失败时不得静默降级为成功，也不得把缺失字段填成空字符串后继续生产流程。

## Canvas 边界

Canvas 可以支持 Markdown 分镜草稿渲染，但必须区分两类节点：

| 节点类型 | 作用 | 可进入 Cut/生成/导出 |
| --- | --- | --- |
| Markdown 分镜草稿节点 | 展示、编辑、评论、参考、快速迭代 | 否，需先转换 |
| 标准 StoryboardTable 节点 | 生产分镜、Canvas route、Cut timeline、生成输入 | 是 |

Canvas Markdown 渲染可以展示缩略图、图片 token、诊断和 resource binding 状态，但不得直接读取文件、缓存目录、Webview URI 或 provider-private path。图片预览仍通过统一内容访问和 Webview resource projection。

当用户在 Canvas 中触发“发送到 Cut”“生成视频”“创建标准分镜节点”等动作时，必须调用共享 normalizer/compiler。如果转换失败，Canvas 显示同一套 diagnostics，不把 Markdown 交给 Cut 或生成工具猜测。

### Send to Canvas 语义

`Send to Canvas` 必须分成两个显式模式，避免用户把草稿节点误认为可生产分镜：

| 用户动作 | 输入 | Canvas 接收 | 语义 |
| --- | --- | --- | --- |
| `Send to Canvas` / `Create Storyboard on Canvas` | Markdown 草稿或标准 payload | 标准 `StoryboardTable` / Canvas storyboard nodes | 生产动作，必须先转换并校验 |
| `Add to Canvas as Creative Draft` | Markdown 草稿 | Creative draft node | 展示、编辑、备注、prompt preview、审批和后续参考 |

默认的 `Send to Canvas` 不直接发送 Markdown 表格。它必须走：

```text
CreativeDraftDocument
  -> @neko/draft-runtime normalizer
  -> resource token binding
  -> StoryboardTable typed projection adapter
  -> Canvas storyboard nodes
```

转换成功后，Canvas 接收的标准协议至少包含：

- `sceneId`
- `shotId`
- `shotNumber`
- `duration`
- `visualDescription`
- `imageStrategy`
- `sourceMediaRefs[].documentResourceRef` 或 `sourceMediaRefs[].resourceRef`
- 必要的 diagnostic / provenance metadata

显式的 `Add to Canvas as Creative Draft` 可以直接发送草稿节点，例如：

```ts
interface CanvasCreativeDraftNode {
  readonly type: 'creative-draft';
  readonly profileId: string;
  readonly markdown: string;
  readonly draft: CreativeDraftDocument;
}
```

首版实现可以通过现有 Canvas 通用内容桥发送 draft-only 结构化内容：

```ts
{
  kind: 'canvasStructuredContent',
  title: 'Creative Draft',
  format: 'json',
  content: {
    schemaVersion: 1,
    kind: 'creative-draft',
    markdown,
    draft,
    draftOnly: true,
  },
}
```

Canvas 侧可以把该结构化内容实例化为 Creative Draft node，但该 payload 仍是 draft-only，不得被 Canvas/Cut/生成/导出当作生产分镜协议。若后续新增 Canvas 私有节点 schema，也必须保持同样的 draft-only 语义和编译门禁。

Markdown 草稿节点只能用于展示、编辑、评论、下一轮 Agent 参考和手动触发“转换为标准分镜”。它不能直接进入 Cut timeline、视频生成、批量媒体处理、导出、实体绑定或正式 Canvas playback route。

当用户触发默认 `Send to Canvas` 但转换失败时，系统必须：

1. 阻止标准 Canvas 分镜创建。
2. 显示转换 diagnostics。
3. 提供“修复并重试”“手动映射资源/字段”“作为 Markdown 草稿发送到 Canvas”等显式后续动作。

不得把转换失败的 Markdown 静默降级为 Canvas Markdown 草稿节点，也不得报告 Canvas 分镜创建成功。

## 包边界

共享能力应放在中立层，而不是沉淀在 Agent 或 Canvas 私有实现：

| 能力 | 建议位置 | 说明 |
| --- | --- | --- |
| 草稿类型、diagnostic 类型、字段规范 | `@neko/draft-runtime` runtime-local DTO；只有持久化或跨包 durable contract 出现时再收窄迁移到 `@neko/shared` | 当前 Agent/Webview 本地传输不需要膨胀 shared；生产协议仍在 shared |
| Markdown/TSV 解析与字段归一化 | `@neko/draft-runtime` | 纯函数，可单测；按 `CreativeDraftProfile` 映射字段，不再维护 storyboard-only parser |
| 图片/资源 token index contract | `@neko/draft-runtime` + host/content adapter | 任意 `resource-token` 或 `role: resource` 字段都可绑定 stable ref；只保存 safe ref 摘要，不保存 cache path |
| Host 侧资源解析 adapter | `neko-content` + Extension adapter | 通过统一内容访问解析 `ResourceRef` |
| Agent skill prompt | `neko-agent` | 只要求输出草稿或标准 payload，不拥有解析逻辑 |
| Chat/Webview 草稿渲染 | `neko-agent` Webview | UI projection |
| Canvas Markdown/Creative Draft 节点渲染 | `neko-canvas` Webview | 领域 UI，可展示 editable `CreativeDraftDocument`，生产动作仍走 typed projection |
| Canvas/Cut 交接 | `neko-canvas` / `neko-cut` adapter | 只接收标准 StoryboardTable 或其他 typed production payload |

两个以上领域需要解析或编译时，能力必须进入共享层或独立 domain package。Agent 不应继续独有 Markdown 表格到分镜协议的业务实现。

选择包位置时遵守：

- 类型和诊断 contract 先保持在 `@neko/draft-runtime`；当 Canvas 项目文件或 Extension/Engine wire contract 需要持久化 generic draft DTO 时，再把最小 DTO 子集迁移到 `@neko/shared`。
- parser/normalizer/resource binder/render/prompt/action readiness 放在 `@neko/draft-runtime`。新 Skill 通过 profile 新增字段、别名、资源角色、prompt template 和 action requirements，不要向 runtime core 增加 storyboard 专属列。
- 新生产输出必须新增 typed projection adapter，例如 `CreativeDraftDocument -> StoryboardTable`、`CreativeDraftDocument -> InteractiveVideoGraph` 或 `CreativeDraftDocument -> ShotImagePrepPlan`。Skill profile 不能直接生成任意生产 JSON。
- Host 资源 materialization、Webview URI、cache rebuild 和 provider adapter 仍归 `neko-content` / Extension Host，不进入 storyboard draft 包。
- Canvas/Cut/Preview 只依赖 contract 和 compiler 结果，不反向依赖 Agent。

## Prompt 与 Agent 约束

Agent 可以优先生成 Markdown 分镜草稿以降低 token 和延迟，但必须遵守：

- 若用户只要求快速草稿/预览，输出 Markdown 草稿即可，并标注其为草稿。
- 若用户要求 Canvas/Cut/生成/导出，Agent 应先触发转换或输出可转换的草稿，不能直接把 Markdown 当生产协议。
- Agent 不得把图片 token 当路径读取，不得发明 `toolCallId`、`resourceRef`、cache path、Webview URI 或 EPUB entry path。
- Agent 局部修复时只接收 Markdown、diagnostics、可用图片 token 摘要和安全 metadata，不接收底层缓存路径。
- 如果转换失败，Agent 应修复失败行或请求用户选择，而不是报告已完成生产交接。

## 非目标

- 不取消标准 `StoryboardTable`。
- 不要求所有分镜都由模型生成完整 JSON。
- 不让 Canvas/Cut/Preview/生成工具直接消费 Markdown 作为生产协议。
- 不在 Markdown 中嵌入 base64、cache path、absolute path、Webview URI、blob URL 或 provider-private payload。
- 不用行号顺序作为资源身份；行号只能辅助诊断。
- 不为了本地 VS Code 客户端引入远程 schema registry、云端工作流治理或多租户协议层。

## 后果

正向后果：

- 模型可以用低 token Markdown 快速生成分镜草稿。
- 用户能直接阅读和编辑分镜表。
- 图片展示可通过 token binding 扩展，但仍走统一内容访问。
- 生产流程继续依赖标准 `StoryboardTable`，Canvas/Cut/Preview/生成工具不用各自猜 Markdown。
- 转换失败可诊断、可修复，不会静默进入错误生产状态。

代价：

- 需要新增共享 parser、normalizer、compiler 和 diagnostics。
- Webview/Canvas 需要展示草稿状态与转换诊断。
- Agent prompt 需要区分“草稿输出”和“生产协议输出”。
- 需要维护 token binding 索引，保证它只包含稳定资源引用和安全摘要。

## 验证要求

实现该 ADR 的变更至少覆盖：

- Markdown 表格可解析为 `StoryboardDraftNormalized`，支持中英文列名。首版若不支持 TSV/fenced block，必须返回明确 diagnostic；后续支持 TSV/fenced block 时必须复用同一 `DraftRowTokenStream` 管线。
- 多个 Markdown table、scene 标题和 scene 列可规范化为多个 `StoryboardTable.scenes[]`，并保持跨 scene 全局 `shotNumber`。
- 标题 rename、scene 重排、缺失显式 id 时的 derived id 和 orphan-risk diagnostic 有测试。
- 一张图片拆成多个 shot、多个 shot 共享同一页图、多张图片组合成一个 shot 的转换都有测试。
- panel/crop 后缀只进入 metadata，不被当成独立文件路径或 cache path 读取。
- duration、sceneId、shotId、shotNumber、imageStrategy 的机械补全有单元测试。
- 图片 token 唯一匹配时生成 `sourceMediaRefs[].documentResourceRef` 或 `resourceRef`。
- 图片 token 多义、缺失、无 stable ref、指向非图片时产生 fail-visible diagnostics。
- token 多义选择结果可回写 normalized draft，并在 retry 时不再次歧义。
- Normalizer 各阶段 parser、column mapper、row normalizer、resource binder、compiler 有独立测试，禁止只测最终成功快照。
- 转换失败的 Markdown 仍能作为草稿渲染，但 Canvas/Cut/生成/导出入口被禁用或要求修复。
- Canvas Markdown 草稿节点不直接读取路径、cache、Webview URI 或 Engine token。
- Send to Canvas / Send to Cut 路径级测试证明标准 `StoryboardTable` compiler 被命中，而不是下游解析 Markdown。
- Agent prompt 测试或 golden snapshot 覆盖：优先 Markdown 草稿、生产动作前必须转换、禁止伪造资源引用。
