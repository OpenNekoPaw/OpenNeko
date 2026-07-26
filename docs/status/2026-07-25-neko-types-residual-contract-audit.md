# `neko-types` 残留契约审计

采集日期：2026-07-25

## 范围

本快照检查功能裁剪、Canvas 六节点收敛、Cut OTIO-only 重建和 Pi Agent runtime
迁移后，`packages/neko-types` 是否仍保留没有生产消费者、没有 canonical owner
或只由测试维持的公共类型、codec、operation 和兼容 UI。

本快照只描述当前工作树，不是长期架构事实或实施计划。长期简化边界见
[`../architecture/adr-ai-native-product-surface-and-capability-composition-boundary.md`](../architecture/adr-ai-native-product-surface-and-capability-composition-boundary.md)、
[`../architecture/adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](../architecture/adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md)
与
[`../architecture/adr-cut-otio-vscode-media-runtime-boundary.md`](../architecture/adr-cut-otio-vscode-media-runtime-boundary.md)。
后续删除公共契约、迁移调用方或改变项目格式必须进入独立 OpenSpec。

## 采集背景

当前工作树中的 `neko-types` 已处于大规模清理过程：

- 相对 `HEAD` 删除约 11,007 行、增加约 2,346 行；
- 23 个文件删除、35 个文件修改，另有新增文件；
- Canvas narrative、flow traversal、subsystem、preset 和部分 storyboard helper
  已经删除；
- 当前 `src` 仍约有 10.7 万物理行，其中顶层 `src/types` 约 5.9 万行。

因此，下文区分“当前已在清理的路径”“可以直接删除的孤儿簇”“需要先迁移或收窄的
共享契约”和“仍有真实生产消费者的契约”。

## 证据来源与方法

证据来自：

- `packages/neko-types/package.json` 和 `src/index.ts` / `src/types/index.ts`
  的公开导出；
- `packages/`、`apps/` 下 TypeScript/TSX 生产源码的 identifier 和 import
  消费者扫描；
- `knip.config.ts` 与聚焦 Knip `files/exports/types` 扫描；
- `pnpm check:legacy-debt`；
- Cut、Canvas、Pi runtime 的 ADR、OpenSpec 和 code-debt ledger；
- NKV codec、project-file registry、EditOperation 和 capability runtime 的真实调用链。

静态统计把测试、fixture、`__tests__` 和定义文件与生产消费者分开。公共类型可能经
`@neko/shared` 根 barrel 导入，因此未仅按文件路径 import 计数，而是继续追踪导出
identifier。动态 import、反射式字符串和未在仓库中的外部消费者仍是已知限制，但
`@neko/shared` 是 private workspace package，外部发布兼容风险较低。

## 总体结论

`neko-types` 的清理只完成了第一层。Canvas narrative 文件删除已经发生，但公共导出面、
旧 NKV/Cut 模型、创作运行时 DTO、持久 Skill lifecycle 和多个大型领域辅助子系统没有
同步收敛。

当前 `src/types/index.ts` 仍通过约 150 个 `export *` 暴露大量类型；
`src/types` 下约有 3,600 个直接导出声明。`package.json` 还提供 `./*` 通配
subpath，使未进入主 barrel 的文件也可能被直接访问。

保守估计，零生产消费者的孤儿类型约 4,800 行。加上 NKV 和只服务旧时间线模型的
operation 实现，高确定性清理空间超过 8,000 行。对仍有消费者的大型契约做字段级
收窄后，实际减少的概念和维护负担会进一步增加。

## 高确定性残留

### 1. 创作调用和 Canvas AI action 旧模型

| 文件                                      |                       规模 | 生产消费者                                             | 结论                                                                           |
| ----------------------------------------- | -------------------------: | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/types/creative-ai-invocation.ts`     | 约 2,094 行、96 个 exports | 无包外生产消费者；只被同包 Canvas AI action 旧类型引用 | 当前是孤立的 conversation routing、run、candidate、promotion 和 apply 状态模型 |
| `src/types/canvas-creative-ai-actions.ts` |   约 785 行、11 个 exports | 无；仅测试引用                                         | 对应 Canvas AI button ADR 已被六节点/Job 模型取代                              |

两者仍由主类型入口导出，`creative-ai-invocation` 还拥有显式 package subpath。
`adr-agent-creative-invocation-run-boundary.md` 仍为 Accepted，因此后续处理必须显式
选择以下唯一方向：

1. 若外部 package-owned AI invocation 仍是当前目标，先通过 OpenSpec 定义最小 envelope
   和真实生产消费者，再删除 conversation/run/candidate 等未消费分支；
2. 若统一 Agent intent/capability 已取代该入口，先 supersede 对应 ADR，再删除整个
   orphan contract。

不得继续把完整实现作为无消费者的未来 scaffold 保留。

### 2. Pi runtime 已取代的持久 Skill 和 context 状态

以下文件没有包外生产消费者：

| 文件                                   |      规模 | 当前证据                                                            |
| -------------------------------------- | --------: | ------------------------------------------------------------------- |
| `src/types/skill-lifecycle.ts`         | 约 241 行 | Pi implementation inventory 已声明 persistent activation state 删除 |
| `src/types/skill-conflict.ts`          | 约 198 行 | 仅旧 lifecycle/conflict 语义，无生产消费者                          |
| `src/types/context-persistence.ts`     | 约 271 行 | 无生产消费者                                                        |
| `src/types/conversation-compressor.ts` | 约 252 行 | 无生产消费者                                                        |

显式 Skill invocation 现在是 turn-scoped；catalog、invocation receipt 和 diagnostic
可以保留，但不需要重新公开 authoritative active-state、slot、lifetime 或 conflict
状态机。

### 3. NKV 仍是可写默认 codec

`package.json` 仍公开 `@neko/shared/nkv`。`src/project-file-io/codecs.ts` 定义可读写
`nkvProjectFormatCodec`，且 `createDefaultProjectFormatCodecRegistry()` 默认同时注册
NKV 和 NKC。

Canvas Extension、Canvas authoring service 和 TUI Workspace Board mutation host
仍创建这个默认 registry。它们实际只需要 NKC，但当前 registry 使 NKV codec 继续
成为可达成功路径。

这与 Cut OpenSpec 的以下约束不一致：

- Cut 只写 OTIO；
- NKV/NKC Cut 文件不迁移、不覆盖；
- 旧 codec 不得成为新路径 fallback；
- 旧文件只能被显式拒绝并保持字节不变。

NKV 生产实现约 1,122 行。后续应把 registry 改为调用方显式注册所需 codec，删除
NKV 默认注册和公共导出；若仍需用户数据检查，只保留独立、只读、显式调用且带
diagnostic 的 inspection/rejection 边界。

### 4. `EditOperation` 仍承载旧视频编辑器

`src/operations/types.ts` 的 `EditOperation` 同时包含：

- Track、Element 和 split；
- Shape、Effect、Mask 和 Keyframe；
- Clipboard 和旧 `ProjectData`；
- Canvas node/connection；
- Batch。

当前包外生产路径只使用 Canvas operation。Track/Element/Shape/Keyframe operation
主要由 NKV history、旧 apply/invert 和相关测试维持。整个 `operations/` 约 2,700 行
生产代码。

清理时不能直接删除 `EditOperation`，因为 Canvas Webview 仍通过 `operationApplied`
message 使用它。目标应是先建立 Canvas-owned 或中立窄 `CanvasOperation` contract，
迁移 Webview/Extension message，再删除旧 timeline/project union、apply/invert 和
NKV history。

`operation-tool-adapter.ts` 也只有 capability runtime bindings 的可选 registry 字段，
没有生产 adapter 注册者；它应随上述边界一起删除或由真实 owner 接管，不能继续作为
空扩展点。

### 5. 无生产消费者的其他完整子系统

以下类型没有生产消费者，或只有测试消费者：

- `audioEffectParams.ts`
- `audioTempo.ts`
- `audioMix.ts` 的大部分规划/renderable normalization
- `creative-media-capability-registry.ts`
- `artifact-projection.ts`
- `storyboard-readiness.ts`
- `storyboard-planner.ts`

其中音频、Effect、Mask、Keyframe 相关类型仍可能被当前 Cut Webview 的迁移中 presentation
代码间接引用。应以 OTIO Presentation Store 当前 OpenSpec 为边界，先完成保留 UI
到 `TimelineView` 的迁移，再垂直删除旧 NKV/professional 类型和测试，不能仅在
`neko-types` 一侧制造断裂。

## 需要收窄的过宽契约

| 文件                            | 规模与消费                                                                              | 收窄方向                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `reference-resolution.ts`       | 约 2,437 行、87 个 exports；包外只使用 `ReferenceDescriptor` 和 `isReferenceDescriptor` | 保留 descriptor、payload 和 validator；删除无消费者的 resolver、batch、summary 和内置 contributor 框架                 |
| `comic-animation-indexing.ts`   | 约 2,204 行、123 个 exports；Agent 只借用 8 个 perception 类型                          | 把通用 perception facet 移到中立小契约；删除漫画索引、连续性、review artifact 和 batch execution 状态机                |
| `shot-image-prep.ts`            | 约 1,676 行、41 个 exports；包外只使用 `SHOT_IMAGE_PREP_PROFILE`                        | 保留或迁移 profile descriptor；删除无运行路径的 plan、budget、retry、transition 和 projector                           |
| `canvas-semantic-storyboard.ts` | 约 1,939 行、47 个 exports；包外只使用一个 prompt guard                                 | 保留 ledger 要求的 migration canonicalizer 和当前 guard；迁移完成后删除 legacy prompt/action/review 状态               |
| `canvas-authoring-contracts.ts` | 约 1,534 行、71 个 exports；包外使用 6 个 catalog/result 符号                           | 保留最小 catalog/result envelope；删除无消费者的 preset、recipe、field profile 和 semantic prompt 扩展                 |
| `storyboard-table.ts`           | 约 3,161 行、86 个 exports；13 个包外生产符号                                           | 保留 canonical table、核心 validator/normalizer 和真实 Cut projection；删除 image strategy、旧 profile 和未消费 helper |
| `composite-artifact.ts`         | 约 2,121 行、67 个 exports；17 个包外生产符号                                           | 保留 artifact/table/profile 核心；删除无消费者的 comparison/timeline/display mapping 和 profile 扩展                   |

`canvas-semantic-storyboard.ts` 在 `LCDR-031` 中登记为 active
boundary-canonicalizer。不能整文件直接删除；只有在持久 storyboard 数据迁移或显式
拒绝完成、canonical prompt authority 测试不再需要旧输入后，才能移除对应迁移逻辑。

## 仍应保留的契约

以下类型已有多个生产消费者或明确 owner，本轮不应按残留整体删除：

- Canvas 六节点/NKC canonical model；
- Canvas Workspace Board、Playback 和 Cut route draft；
- StoryboardTable 与 CompositeArtifact 的核心数据和展示投影；
- AgentCapabilityLifecycle 当前 invocation/result contract；
- NPC Test Bench 当前产品能力；
- Content、ResourceRef、local metadata、storage 和 project authoring 基础契约；
- Proto 生成的 Engine types；如需删除字段，应从 `neko-proto` 单一事实来源修改。

保留不代表维持当前文件规模。仍需按实际消费者缩小 public export，并把 domain-specific
实现移回 owning package。

## 其他公共面残留

### Tool name catalog

`src/types/tool-names.ts` 仍保留：

- 无生产消费者的整套旧 Timeline Tool 名；
- 空的 `TOOL_NAMES_CREATION`；
- 空的 `TOOL_NAMES_EXECUTION`；
- 一个声称统一但没有包含 Entity/Search 的 `TOOL_NAMES` 聚合对象。

Canvas、Media、Perception、Entity、Search、Quality 和 System 的 owner 常量仍有真实
消费者。后续应删除空/旧类别，并优先让各 capability provider 的真实注册元数据成为
能力存在的事实来源，避免维护平行全局 catalog。

### `@neko/shared/components`

`src/components` 约 2,094 行，并已在注释中标记为 legacy compatibility surface。
当前生产消费者只剩：

- `@neko/ui` 对 ResizeHandle 和 hooks 的兼容 re-export；
- Agent DropZone 对 `useFileDrop` 的直接导入。

Toolbar、Panel、ContextMenu、TimelineRuler、ProgressBar 和 Mac controls 等大部分共享
组件没有生产消费者；Preview 使用的是包内另一套 Mac controls，Cut 使用 `@neko/ui`
TimelineRuler。应先把剩余 hooks/ResizeHandle/useFileDrop 提升到 `@neko/ui`，再删除
`@neko/shared/components` subpath 和兼容测试白名单。

### Package exports

当前 package exports 同时包含精确 subpath 和 `./*` 通配路径。通配路径允许消费者绕过
主 barrel 和边界审查。完成迁移后应删除 `./*`，只公开有真实跨包消费者、稳定 owner 和
测试的显式 subpath。

## 门禁缺口

`knip.config.ts` 明确排除了 `types`：

```ts
exclude: [
  // Type-only exports in app code create too much noise for this monorepo.
  'types',
],
```

因此 `pnpm check:unused` 通过不能证明共享类型已经清理。聚焦启用 `types` 后会报告大量
未使用 type/export，但主 barrel、package entry 和动态边界会产生噪音，不能直接
`knip --fix`。

`pnpm check:legacy-debt` 本次通过，但它是关键词和 ledger 扫描，不判断一个没有生产
消费者的类型模型是否仍有必要。本次结果中：

- `@neko/shared` 仍是最大热点，共 344 个 `legacy`/`fallback`/`deprecated` 命中；
- 非测试源码仍有 87 个 `migrate-now` 命中；
- `canvas-semantic-storyboard.ts` 是最大单文件热点，共 38 个 legacy 命中。

需要补充 shared-contract 专项门禁：

1. 对 `src/types/index.ts` 和 package exports 维护显式允许清单；
2. 报告每个公共类型的包外生产消费者数量；
3. 将“仅测试消费者”和“仅同包孤儿簇消费者”设为失败；
4. 对 migration-only contract 要求 ledger owner、remove condition 和验证命令；
5. 禁止无生产 consumer 的新 optional Provider、registry 和状态机进入 shared。

## 建议实施批次

### P0：删除孤儿和不可达成功路径

- 删除 Canvas creative AI action 旧簇；
- 处理 creative invocation ADR 冲突，收敛为最小真实 envelope 或整体退休；
- 删除持久 Skill lifecycle/conflict、context persistence 和 conversation compressor
  孤儿类型；
- 从默认 project codec registry 移除 NKV，显式隔离或删除旧 codec；
- 删除空 Creation/Execution Tool namespace 和无人使用的旧 Timeline Tool 名。

### P1：收敛旧编辑和领域大契约

- 把 `EditOperation` 收敛为 Canvas mutation contract；
- 删除旧 timeline/project apply、invert、history 和 professional media 类型；
- 分拆 Reference、Comic indexing、Shot image prep、Canvas semantic storyboard；
- 对 StoryboardTable、CompositeArtifact 和 Canvas authoring 做 symbol-level public
  surface 收窄。

### P2：收紧共享包边界

- 把剩余 UI hooks/primitives 迁到 `@neko/ui`；
- 删除 `@neko/shared/components` compatibility surface；
- 删除 package `./*` wildcard export；
- 为 shared contract 增加消费者和孤儿簇门禁。

## 验证记录

- 全仓 `rg`/identifier 消费者追踪：完成，区分生产、同包、测试和无引用。
- 聚焦 Knip `files/exports/types` 扫描：完成；结果用于发现候选，不作为自动删除依据。
- `pnpm check:legacy-debt`：通过；`@neko/shared` 为最大热点。
- ADR/OpenSpec/ledger 核对：完成；确认 Cut OTIO-only、Pi Skill lifecycle 删除以及
  Canvas semantic storyboard migration 的保留条件。

本轮只做只读分析和文档记录，没有修改生产代码，也没有运行类型检查、构建或测试。

## 已知限制

- 当前工作树仍在进行 Canvas/Cut 简化，部分消费者可能在后续提交中继续删除或迁移。
- `@neko/shared` 为 private workspace package，但 `./*` wildcard 可能隐藏静态扫描未覆盖的
  subpath 消费。
- 类型名称扫描可能把同名局部符号计为消费者；本快照对高优先级候选继续核对了 import
  和调用链，因此高确定性结论不只依赖名称次数。
- Canvas semantic storyboard、NKC migrator、Skill metadata 和 local metadata 中的显式
  migration reader 保护持久用户数据，不能以减少 LOC 为由静默删除。
