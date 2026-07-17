# ADR: Canvas MCP 式能力与 Markdown 资源增强渲染边界

状态：Accepted
日期：2026-06-29
更新：2026-07-10
范围：`neko-agent`、`neko-canvas`、`@neko/markdown`、`@neko/shared`、`@neko/ui`、Agent Webview Markdown、Canvas authoring capabilities、Canvas 文本/表格/分镜节点、CompositeArtifact / GenericTable、Markdown 文档和资源投影。

本文记录 OpenNeko 对 “Agent 生成 Markdown、Agent Webview 增强渲染、Canvas 通过 MCP 式能力创建/校验/渲染内容” 的系统级边界。它补充 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、[`adr-agent-autonomous-filmmaking-creation-boundary.md`](adr-agent-autonomous-filmmaking-creation-boundary.md)、[`adr-markdown-storyboard-draft-protocol.md`](adr-markdown-storyboard-draft-protocol.md)、[`adr-canvas-cut-playback-route-and-timeline-boundary.md`](adr-canvas-cut-playback-route-and-timeline-boundary.md) 和 [`proto-and-wire-contracts.md`](proto-and-wire-contracts.md)。

> 2026-07-06 更新：本文早期把默认 `Send to Canvas` 描述为直接调用 `canvas.ingestMarkdown`。当前 canonical path 已收敛为：Agent Webview 创建 Agent-visible Canvas authoring handoff intent；Agent 自主决定是否激活 `canvas-authoring` Skill、查询 Canvas authoring catalog/context、选择 Canvas Markdown capability 或其它 Canvas tool。`canvas.ingestMarkdown` 等 Markdown capabilities 仍是 Canvas-owned tools，但不再由 Webview/Extension 作为按钮副作用直接调用。

> 2026-07-06 更新：Markdown 分镜表的生产导入已经收敛到 Canvas semantic storyboard authoring。`canvas.createStoryboardFromMarkdown` 创建 `storyboardPrompt` semantic prompt documents；Markdown 中名为 `Generation Prompt` 或 `generationPrompt` 的列只作为 prompt 输入，不重新写入 `/generationPrompt` 作为分镜提示词权威。

> 2026-07-10 更新：`@neko/markdown` normalized document/session contract 与 Agent TUI canonical terminal adapter 已落地；Agent Webview 仍直接使用 `react-markdown + remark-gfm`。因此本文的 Canvas/resource boundary 继续为 Accepted，但“所有 Markdown host 已语义统一”仍是**未接受/未完成**结论。移除 gate 由 [`migrate-agent-webview-to-normalized-markdown`](../../openspec/changes/migrate-agent-webview-to-normalized-markdown/) 跟踪。

## 背景

Agent 适合生成和解释 Markdown：它可以快速输出分析、计划、分镜表、提示词、资源引用和下一步建议。Canvas 则拥有节点 schema、布局、preset、资源预览、持久化和用户交互状态。如果用一个公开 `draft-runtime/compiler` 管线把 Markdown 先转成中间协议，再由 Agent Webview 发送 payload 给 Canvas，会产生几个问题：

- Agent/Webview 需要理解越来越多 Canvas 节点和生产协议细节。
- 中间 runtime 容易同时承担 Markdown parser、field normalizer、resource binder、render projection、compiler 和 action readiness，边界变厚。
- 新场景如互动视频、角色关系图、分支剧情、素材审查可能继续复制一套 parser + compiler。
- 用户真正想做的是 “把这段内容放进 Canvas / 创建分镜 / 创建草稿表”，不是理解某个 compiler。

因此 Neko 采用 Canvas-owned authoring 能力模型：

```text
Agent 生成 Markdown / 文本 / 结构化内容和意图
  -> @neko/markdown 生成 host-agnostic syntax projection
  -> Agent Webview 增强渲染，显示表格、图片引用、@引用、semantic spans 和诊断
  -> Send to Canvas 创建 Agent-visible handoff intent
  -> Agent 查询 Canvas authoring catalog/context，按需激活 Canvas Skill
  -> Agent 选择 Canvas-owned tool / Markdown capability
  -> Canvas 校验输入、绑定资源、创建节点、返回结构化 authoring result
```

## 决策

Canvas 是 Canvas 节点、连接、字段/profile、资源绑定、undo/history 和持久化的权威。Agent 不直接写 `CanvasNode[]`，Agent Webview 不拥有 Canvas 编译管线。`Send to Canvas` 不再被建模为“发送最终 Canvas payload”或“按钮直接调用 Canvas capability”，而是创建 Agent-visible handoff intent；是否调用 `canvas.ingestMarkdown`、`canvas_create_composite`、`canvas_update_block` 或其它 tool 由 Agent 在当前上下文中决定。

```text
Agent Markdown
  headings / paragraphs / tables / prompts / resource embeds / @mentions
        |
        v
@neko/markdown projection
  CommonMark/GFM tables, images, resource-reference tokens, mentions, semantic prompt spans
        |
        v
Agent Webview enhanced rendering + handoff envelope
  stable refs, diagnostics, prompt spans, target hints, provenance
        |
        v
Agent-selected Canvas authoring operation
  query: canvas_describe_authoring_capabilities / canvas_get_active_context / canvas_list_nodes
  mutate: canvas_create_node / canvas_create_composite / canvas_update_block / Canvas Markdown capabilities
        |
        v
Canvas runtime
  validate, bind resources, create nodes, persist, render
        |
        v
Capability result
  nodeIds, diagnostics, follow-up actions
```

`@neko/draft-runtime` 不再是长期 canonical boundary。已经实现的 Markdown table 解析、字段别名、duration 解析、资源 token 绑定和 storyboard projection 可以迁移为 Canvas capability 私有实现、Agent Webview 展示 helper，或删除。跨包长期契约应是 Canvas capability input/output，而不是 `CreativeDraftDocument` 这类中间协议。

## 非目标

- 不创建一个通用 Markdown-to-Canvas compiler。
- 不让 Agent 直接输出或修改 `CanvasNode[]` 作为项目事实。
- 不把 Markdown table 替代 Canvas table node、StoryboardTable、Cut timeline 或 GenericTable。
- 不要求普通 `.md` 文件自动获得完整 Canvas 渲染能力。
- 不把 Webview URI、blob URL、cache path、临时绝对路径或裸文件名当作持久资源身份。

## Canvas MCP 式能力

Canvas capability 以工具 schema 的方式暴露给 Agent、Agent Webview 和其他本地调用方。能力拥有输入校验、资源解析、节点创建和诊断输出。

推荐能力：

| Capability | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| `canvas.ingestMarkdown` | Markdown、title、resourceRefs、target、intent/profile hints | note/table node id、resolved kind、diagnostics、actions | Agent 选中 Markdown review/apply 后的通用入口：由 Canvas 解析为 Markdown note、generic table 或 creative table |
| `canvas.createMarkdownNote` | Markdown、title、resourceRefs、target | text/document node ids、diagnostics | 显式把分析、计划、提示词说明放到 Canvas |
| `canvas.createTableFromMarkdown` | Markdown table、resourceRefs、target | table node id、diagnostics | lower-level generic table wrapper |
| `canvas.createStoryboardDraftFromMarkdown` | Markdown 分镜表、profile hint、resourceRefs、target | draft/review node id、diagnostics、actions | lower-level storyboard review wrapper；storyboard 只是 creative table profile |
| `canvas.createStoryboardFromMarkdown` | Markdown 分镜表、resourceRefs、mode、target | scene/shot/media node ids、diagnostics | 用户明确要求创建 Canvas 分镜节点 |
| `canvas.attachResource` | node target、resourceRef、role | changed node id、diagnostics | 给已有节点挂接媒体资源 |
| `canvas.validateMarkdownStoryboard` | Markdown、resourceRefs | diagnostics、normalized preview summary | 只校验和预览，不写 Canvas |

示例输入：

```ts
canvas.ingestMarkdown({
  markdown,
  intentHint: 'creative-table',
  profileHint: 'storyboard',
  resources: [
    { token: 'cover', resourceRef },
    { token: 'P1', documentResourceRef },
  ],
  target: { containerId, insertionPoint },
});
```

示例输出：

```ts
{
  status: 'needs-review',
  draftNodeId: 'draft-1',
  nodeIds: ['draft-1'],
  diagnostics: [],
  actions: [
    { actionId: 'create-storyboard-nodes', label: 'Create storyboard nodes' },
  ],
}
```

Capability input/output DTO 可放在 `@neko/shared` 或 Canvas extension API 中，按是否跨包复用决定。实现函数留在 `neko-canvas`，不得让 Agent 或 Agent Webview import Canvas internals。

### Capability DTO 草案

第一阶段必须把 Agent Webview 和 Canvas 之间的契约类型化。DTO 应优先放在 Canvas extension API；当 Agent Webview、Agent runtime 和 Canvas 都需要静态 import 同一份类型时，再把最小子集提升到 `@neko/shared`。

```ts
type CanvasMarkdownCapabilityId =
  | 'canvas.ingestMarkdown'
  | 'canvas.createMarkdownNote'
  | 'canvas.createTableFromMarkdown'
  | 'canvas.createStoryboardDraftFromMarkdown'
  | 'canvas.createStoryboardFromMarkdown'
  | 'canvas.attachResource'
  | 'canvas.validateMarkdownStoryboard';

type CanvasMarkdownSourceFormat =
  | 'markdown'
  | 'markdown-table'
  | 'gfm-table'
  | 'resource-reference-markdown';

type CanvasMarkdownCapabilityStatus =
  | 'created'
  | 'changed'
  | 'validated'
  | 'needs-review'
  | 'blocked';

type CanvasMarkdownIngestIntent =
  | 'auto'
  | 'note'
  | 'table'
  | 'creative-table';

type CanvasMarkdownResolvedKind =
  | 'markdown-note'
  | 'generic-table'
  | 'creative-table';

interface CanvasMarkdownResourceRef {
  readonly token?: string;
  readonly label?: string;
  readonly role?: string;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
}

interface CanvasMarkdownCapabilityTarget extends CanvasAgentTargetRef {
  readonly mode?: 'insert' | 'append' | 'replace' | 'apply' | 'create-child';
}

interface CanvasMarkdownCapabilityDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly token?: string;
  readonly line?: number;
  readonly column?: number;
  readonly fieldKey?: string;
}

interface CanvasMarkdownCapabilityAction {
  readonly actionId: string;
  readonly label?: string;
  readonly capabilityId?: CanvasMarkdownCapabilityId;
}

interface CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly markdown: string;
  readonly title?: string;
  readonly sourceFormat?: CanvasMarkdownSourceFormat;
  readonly resources?: readonly CanvasMarkdownResourceRef[];
  readonly target?: CanvasMarkdownCapabilityTarget;
  readonly provenance?: CanvasAgentProvenance;
  readonly intentHint?: CanvasMarkdownIngestIntent;
  readonly profileHint?: string;
}

interface CanvasIngestMarkdownInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.ingestMarkdown';
}

interface CanvasCreateMarkdownNoteInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createMarkdownNote';
}

interface CanvasCreateTableFromMarkdownInput extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createTableFromMarkdown';
  readonly tableTitle?: string;
}

interface CanvasCreateStoryboardDraftFromMarkdownInput
  extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createStoryboardDraftFromMarkdown';
}

interface CanvasCreateStoryboardFromMarkdownInput
  extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.createStoryboardFromMarkdown';
  readonly mode?: 'review-first' | 'create-nodes';
}

interface CanvasAttachResourceInput {
  readonly capabilityId: 'canvas.attachResource';
  readonly target: CanvasMarkdownCapabilityTarget;
  readonly resource: CanvasMarkdownResourceRef;
  readonly role?: string;
  readonly provenance?: CanvasAgentProvenance;
}

interface CanvasValidateMarkdownStoryboardInput
  extends CanvasMarkdownCapabilityBaseInput {
  readonly capabilityId: 'canvas.validateMarkdownStoryboard';
}

type CanvasMarkdownCapabilityInput =
  | CanvasIngestMarkdownInput
  | CanvasCreateMarkdownNoteInput
  | CanvasCreateTableFromMarkdownInput
  | CanvasCreateStoryboardDraftFromMarkdownInput
  | CanvasCreateStoryboardFromMarkdownInput
  | CanvasAttachResourceInput
  | CanvasValidateMarkdownStoryboardInput;

interface CanvasMarkdownCapabilityResult {
  readonly capabilityId: CanvasMarkdownCapabilityId;
  readonly status: CanvasMarkdownCapabilityStatus;
  readonly resolvedKind?: CanvasMarkdownResolvedKind;
  readonly profileId?: string;
  readonly displayFallback?: boolean;
  readonly nodeIds?: readonly string[];
  readonly draftNodeId?: string;
  readonly tableNodeId?: string;
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
  readonly actions?: readonly CanvasMarkdownCapabilityAction[];
}
```

这些 DTO 是能力边界，不是 Canvas 内部节点格式。Canvas implementation 可以在内部创建 `CanvasNode`、`CanvasStoryboardPayload`、table node 或 text node，但不把这些内部结构暴露给 Agent 作为可手写目标。

## Send to Canvas

Agent Webview 的 `Send to Canvas` 是快捷 handoff，而不是 Canvas 命令按钮。它构造 typed context payload：source content、source kind、stable resource refs、semantic stable refs、diagnostics、prompt spans、title、provenance、user intent 和 target hints。Extension Host 只把它转成普通 Agent user message + context payload，不预激活 Canvas Skill，不选择 Canvas tool，不调用 `neko.canvas.importAsset`。

| 用户动作 | 语义 | 允许的后续路径 |
| --- | --- | --- |
| Send to Canvas | Agent-visible authoring handoff | Agent 查询 catalog/context 后选择 Canvas tool、Markdown capability、直接 import、询问用户或拒绝 |
| Import / Add Source to Canvas | 显式素材导入 | Extension 可调用 `neko.canvas.importAsset` 或 Canvas add-source path |
| Agent-selected Markdown review/apply | Canvas-owned Markdown capability | `canvas.ingestMarkdown`、`canvas.createTableFromMarkdown`、`canvas.createStoryboardFromMarkdown` 等 lifecycle/tool invocation |
| Agent-selected node/composite authoring | Canvas-owned node tools | `canvas_create_node`、`canvas_create_composite`、`canvas_update_block`、`canvas_apply_agent_content` 等 |

默认动作应偏 review-first：

- 普通 Markdown/GFM table 被 handoff 给 Agent；Agent 应在需要 Canvas 语义时先查询 Canvas authoring catalog/context。
- Markdown 分镜表是 prompt-first creative authoring 内容，`storyboard` 只是 Canvas profile hint；profile/field authority 仍由 Canvas descriptor registry 校验。
- Markdown 分镜表进入生产 Canvas 节点时，Canvas Markdown capability 必须写入 `storyboardPrompt` semantic prompt documents。旧 `generationPrompt` 字段只允许作为 migration/import input、derived display 或 diagnostics 来源；新路径不得通过 `/generationPrompt` 报告 prompt-first authoring 成功。
- 只有 Agent 选中对应 Canvas mutation tool/capability，并满足确认/approval 要求时，才创建或更新 Canvas 节点。
- 显式素材导入必须使用单独 UI 文案（如 Import / Add Source），不得伪装成 Agent-authored Canvas composition。

## Markdown 增强渲染

Agent Webview Markdown renderer 应支持资源增强渲染，但只作为当前消息的展示投影。该能力必须分阶段实施，避免把 Neko resource-reference parser、文档 resolver 和 Canvas capability 同时塞进同一轮变更。

当前宿主状态（2026-07-10）：

- `@neko/markdown` 已拥有 authoritative source、exhaustive CommonMark/GFM normalized nodes、半开 UTF-16 ranges、annotations、resolution association、diagnostics 和 append/finalize `MarkdownStreamingSession`。
- Agent TUI assistant Markdown 已从首 delta 到 finalize 统一进入 normalized session → terminal projector → layout/highlighter → safe encoder → thin Ink adapter；resize 对同一 revision reflow，不重新 parse。
- TUI 的 regex parser、逐行 regex highlighter、final-only renderer 和 assistant `StreamingText` Markdown path 已移除且不得 fallback。
- Agent Webview **尚未迁移**：普通 Markdown/GFM 仍由 `react-markdown + remark-gfm` 直接解释；creative table、code language 和部分 React components 仍依赖该 parser AST，同时另行消费部分 `@neko/markdown` extension/resource projection。
- 因此 cross-host semantic unification 仍未 Accepted。Webview 必须完成 normalized adapter、shared fixtures、direct dependency cleanup、legacy parser poison 和 Extension Development Host runtime acceptance 后，才能移除此 gate。
- Webview 审计见 [`webview-audit.md`](../../openspec/changes/normalize-agent-tui-markdown-rendering/webview-audit.md)，实施变更见 [`migrate-agent-webview-to-normalized-markdown`](../../openspec/changes/migrate-agent-webview-to-normalized-markdown/)。
- `![[...]]` / `[[...]]` 在 resolver-backed 完整实现前必须保留文本并返回 unsupported diagnostic，不能被当作稳定资源成功解析；Send to Canvas 仍通过 `requestCanvasAuthoringHandoff` 进入 Agent，不直接调用 Canvas capability。

后续资源增强阶段：

- 新增独立 Markdown resource extension parser，支持 Neko resource-reference embed/link（语法借鉴文件引用体验，但不是 Obsidian 兼容层）。
- 接入 document/resource resolver。
- 增加诊断渲染和歧义提示。

最终目标语法：

```md
![[cover.png]]
![[Chapter 1#Section]]
![cover](assets/cover.png)
```

语义：

| 语法 | 含义 | 解析结果 |
| --- | --- | --- |
| `![[cover.png]]` | Neko resource-reference embed；表示项目/turn 资源 token 或 host 可解析文件引用 | resource lookup hint；绑定到 `ResourceRef` 后显示图片 |
| `![[Chapter 1#Section]]` | 文档或 Markdown section embed | document locator / context link；可渲染为 excerpt card 或跳转链接，不默认当图片 |
| `![cover](assets/cover.png)` | CommonMark image | workspace-relative/source ref lookup hint；可解析时显示图片，不可解析时诊断 |
| `[[Chapter 1#Section]]` | 内部文档链接 | 文档 locator/context link，不嵌入媒体 |
| `P1` / `cover` / `read-image-cover.jpg` in table cell | 表格资源 token | 只作为 lookup hint；不能作为成功路径 |

增强渲染规则：

- Webview renderer 不直接读取文件系统，不扫描 cache root。
- `![[...]]` 和 `![...](...)` 先进入 resource/document resolver；只有 resolver 返回 stable ref 和 runtime `renderUri` 时才显示媒体。
- `renderUri` runtime-only，不写回 Markdown、Canvas、artifact 或 clipboard durable payload。
- 未解析、歧义、越权、非 portable 路径必须显示 diagnostic，不静默隐藏。
- `![[Chapter 1#Section]]` 这类非媒体引用应显示为文档/章节引用，而不是强行图片。

`![[...]]` 解析应作为独立 OpenSpec/ADR 或本 ADR 的独立实施 Phase，不阻塞 Canvas authoring catalog、handoff intent 和 Canvas capability schema 的第一阶段落地。实现时必须定义 `#` 的歧义规则：文件 locator、文档 section、panel hint 和 crop hint 不得靠字符串猜测静默成功。

## Skill / 提示词输出声明

需要声明扩展渲染方式，但声明的是 authoring format 和 resource reference policy，不是 UI 组件细节。通用 Markdown 扩展语法、资源引用协议、视觉证据要求和禁止输出 cache path / Webview URI 的规则由系统提示词、shared Markdown/profile 层和 capability catalog 提供；Skill 只声明领域输出意图、推荐字段和生成内容要求，避免把通用 Markdown/Canvas 工具协议塞进领域 Skill。

推荐声明：

```yaml
output:
  format: markdown
  markdownExtensions:
    - gfm-table
    - resource-reference
    - commonmark-image
  resourceReferences:
    preferred:
      - "![[resource-token]]"
      - "![alt](workspace-relative-or-variable-path)"
      - "table cell token"
    forbidden:
      - "webviewUri"
      - "blob:"
      - "cachePath"
      - "/tmp"
      - "/var/folders"
  canvasActions:
    preferred:
      - "canvas.ingestMarkdown"
      - "canvas.createStoryboardFromMarkdown"
```

Prompt wording example:

```md
Output a Markdown storyboard table. Use `![[token]]` or a table resource token
for referenced images. Do not output cache paths, Webview URIs, blob URLs, or
Canvas node JSON. After the table, suggest Canvas ingest intent/profile hints by name.
```

Skill 可以要求 Agent 输出：

- Markdown table for review；
- explicit resource token column；
- next-step Canvas handoff hints such as `declaredIntentHint: "creative-table"` and `declaredProfileHint: "storyboard"`；Agent 只有在选中 Canvas Markdown capability 时才把它们转为 tool input；
- no direct Canvas node JSON.

Canvas capability invocation carries the actual `ResourceRef` / `DocumentArchiveResourceRef` array separately. Markdown remains human-readable; resource refs remain structured tool input.

## Resource Binding

资源绑定沿用项目内容访问边界；详细禁止列表、路径变量、cache/runtime handle 和 Webview URI 规则以 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md) 为准。本 ADR 只补充 Markdown/capability 入口如何进入该边界：

```text
Markdown token / embed / image path
  -> turn resource index + project/document resolver
  -> ResourceRef | DocumentArchiveResourceRef | source ref
  -> runtime renderUri projection
```

Markdown token、`![[...]]`、CommonMark image URL 和表格单元格文本都只是 lookup hint。Canvas capability input 必须携带已解析的 `ResourceRef`、`DocumentArchiveResourceRef`、workspace-relative path、`${VAR}/path` 或 document/source locator；无法解析时返回 diagnostic，不得把裸 token 或路径字符串当成功资源写入 Canvas 节点。

## `neko-composite` 和 `draft-runtime` 清理

`neko-composite` 不应再作为新分镜草稿 authoring 格式。新的分镜草稿输出使用 Markdown table + resource embeds；结构化创建动作走 Canvas capability。

保留：

- `CompositeArtifact`
- `GenericTable`
- `media-preview`
- `resource-ref`
- RichContent renderer for validated tool results
- 现有 `canvasStoryboard` / `canvasText` / `canvasStructuredContent` plugin transfer 仅作为已校验结构化工具结果、资产发送和旧命令桥接路径保留；不得作为 Markdown authoring draft 的默认成功路径。

清理：

- 要求模型输出 `neko-composite` storyboard JSON 的 Skill/prompt 样例。
- Agent 普通文本中把 `neko-composite` storyboard-table 当作新路径成功输入的测试。
- `@neko/draft-runtime` 作为跨包 canonical parser/compiler 的依赖。

迁移策略：

- Agent Webview 保留 Markdown 表格增强渲染。
- Canvas capability 内部可临时复制或移动 `duration`、Markdown table parser、字段 alias 等纯函数。
- 旧 `CreativeDraftDocument` payload 仅作为 prelaunch migration/diagnostic 输入；新路径不再生成它。
- 后续删除 `canvasStoryboard` plugin transfer 的条件是：所有仍输出 `StoryboardTable` / `CanvasStoryboardPayload` 的 validated tool result 都能通过 Canvas capability 或 owning-domain command 表达，并有路径级测试证明 Markdown authoring draft 不再依赖 plugin transfer fallback。

## 包边界

| 包 | 职责 |
| --- | --- |
| `neko-agent` | 生成 Markdown/文本/结构化内容、展示增强 Markdown、创建 Agent-visible Canvas handoff、由 Agent runtime 自主选择 Skill/tool |
| `neko-canvas` | 暴露 authoring catalog、Canvas-owned Skills/tools/capabilities；校验、绑定资源、创建节点、渲染 Canvas 内容 |
| `@neko/markdown` | authoritative source、normalized CommonMark/GFM/extension nodes、ranges、annotations、diagnostics、streaming session 与 resolution/renderer adapter contracts；不做 Canvas 校验或 mutation |
| `@neko/shared` | 跨包 DTO：ResourceRef、DocumentArchiveResourceRef、Canvas authoring catalog/result、capability input/output 的最小共享契约 |
| Extension Host | stable ref -> bytes/cache/renderUri；路径授权、CSP、diagnostics |
| `@neko/ui` | 可复用的无业务 Markdown/table/resource cell UI 原语，成熟后再提取 |

依赖方向：

- Agent 不依赖 Canvas internals。
- Canvas capability 不依赖 Agent Webview。
- `@neko/markdown` core 不依赖 Agent、Canvas、VS Code、React、DOM 或 feature package internals。
- Webview 不直接读取文件系统。
- Shared/content 不依赖 React、VS Code、DOM 或功能包 internals。

## 验收要求

- Agent TUI path-level tests 必须证明 first delta、intermediate update、same-session finalize、historical/timeline/failure presentation 只进入 normalized session/projector/layout path，legacy parser/highlighter/final-only/assistant plain path 不可成功。
- TUI runtime fixture 必须覆盖 color/`NO_COLOR`、Unicode/ASCII、OSC 8/fallback、table mode、code reflow、resize、incomplete streaming finalize 和 provider terminal controls inert。
- Agent Webview semantic convergence 只有在 linked change 的 direct parser dependency cleanup、shared fixture、legacy poison 和 Extension Development Host runtime gate 全部通过后才可声明完成；普通浏览器/JSDOM 不能替代该 gate。
- Agent Webview 能把 `![[cover.png]]`、`![[Chapter 1#Section]]`、`![cover](assets/cover.png)`、`@mention` 和 semantic prompt spans 渲染为 projection、预览、文档引用或明确 diagnostic。
- Send to Canvas 创建 Agent-visible handoff intent，而不是让 Agent/Webview 直接构造 `CanvasNode[]`、调用 Canvas capability 或走旧 plugin-transfer payload。
- Extension route 测试证明 handoff 不调用 `neko.canvas.importAsset`、Canvas Markdown capabilities 或 Canvas mutation tools。
- `@neko/markdown` projection 测试证明 stable refs、diagnostics、prompt spans 只进入 handoff metadata，不成为 Canvas validation 或 mutation authority。
- Canvas capability 测试证明节点由 Canvas runtime 创建，并返回 node ids、diagnostics 和 actions。
- Markdown 分镜表创建 Canvas 节点时，测试证明资源来自 stable refs，而不是 token、文件名或 cache path。
- Canvas `canvas-authoring` Skill 和 catalog 声明 Markdown 扩展、resource reference policy、query-before-mutate、prompt-field alignment 和 repair loop。
- 新路径不 import `@neko/draft-runtime`；旧包已在预发布清理中删除，Canvas capability 私有实现和 Agent Webview presentation helper 承接仍有价值的解析/资源展示行为。

## 后果

正面影响：

- 架构更接近 MCP：能力由拥有者执行，Agent 调用工具。
- Canvas 保持节点和渲染权威，不暴露内部 node schema 给 Agent。
- Markdown 保持高效、可读、适合审阅和提示词输出。
- Neko resource-reference embeds 和 CommonMark images 可以统一进入资源解析，而不是靠文件名猜测。
- 新场景通过新增 Canvas capability 或 Skill 输出声明扩展，而不是新增一套全局 compiler。

代价：

- Canvas 需要补齐 capability schema、诊断和创建动作。
- Agent Webview 已有部分 resource-aware Markdown enhancement，但仍需迁移到 normalized document/session adapter 并移除 direct parser；在 linked gate 完成前存在跨宿主语义漂移风险。
- 旧 `@neko/draft-runtime` 已删除；`neko-composite` 仍保留为已校验结构化工具结果的 rich content 格式，但不再作为新分镜草稿 authoring 默认格式。
