# ADR: 统一 Markdown 与资源增强渲染边界

状态：Accepted（实施验收由活跃 OpenSpec 跟踪）

更新日期：2026-08-09

范围：Agent、Text Editor、Canvas、`@neko/markdown`、共享契约、Desktop Host、Renderer 与资源投影。

## 决策

Workspace Markdown source 是内容 authority。`@neko/markdown` 是 OpenNeko GFM profile、normalized
semantic contract、source range、annotation、diagnostic、outline/reference 和扩展语义的唯一基础
owner；它不是用户可见的私有 Markdown 方言。默认入口保持 host-neutral；显式 browser entry 只拥有
受控 Milkdown Rich Surface 的可丢弃浏览器生命周期，不拥有调用方文档事实。

不同用户意图使用一个精确的 presentation owner，不共享 renderer，也不得在失败后切换：

| 意图                                     | Presentation owner                     | 约束                                                 |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Markdown Rich 引擎                       | `@neko/markdown/rich-surface` / Milkdown | 只投影 caller-owned source，不拥有文档               |
| Markdown 文件 Rich 编辑                  | Text Editor Webview adapter            | exact Text Document session 拥有 accepted source     |
| Canvas Markdown Rich 编辑                | Canvas Webview adapter                 | exact Canvas Markdown node 拥有 inline source        |
| Markdown Source 与其他文本编辑           | Text Editor Webview / CodeMirror 6     | 完整源码编辑；Milkdown code-block component 不能替代 |
| Agent text content block                 | Agent Webview / package-local renderer | partial 到 final 使用同一 surface                    |
| Tool、Approval、Artifact、媒体和领域结果 | owning typed presenter                 | 不进入 Markdown renderer                             |

```text
authoritative Markdown source/revision
  -> @neko/markdown semantic projection
  -> outline/reference/diagnostic + stable resource refs
  -> exact surface adapter or domain consumer
```

Markdown 默认入口不依赖 Agent、Canvas、Electron、React、DOM、Milkdown、CodeMirror、Streamdown 或
领域内部实现。浏览器 Rich entry 与默认入口显式隔离。Surface engine 的第三方 AST 不跨包暴露；每个 surface 必须通过同一 GFM conformance
corpus，但不得把另一个 surface 的 DOM、selection 或 editor transaction 当成内容事实。

## GFM Profile

OpenNeko 采用公开 GFM 0.29-gfm：CommonMark 加 autolink literal、允许一对或两对 `~` 的
strikethrough、table、task-list item 和 tagfilter。reference link 和 fenced code 属于 CommonMark
基线。Raw HTML 保留为 source/semantic evidence，但浏览器默认 inert；危险 URL 在展示/信任边界
拒绝。

Mermaid、Math、footnote、`@mention`、`![[resource]]` 与 Workspace resource link 是分别注册的
extension，不冒充 GFM。扩展缺失或失败必须产生局部 diagnostic，不得改用另一 parser/renderer、
执行 raw HTML 或把不支持的 source 静默改写为成功。

## 编辑与 Agent 展示

Markdown 内容编辑器使用 `Rich | Source | Split`。Milkdown Rich 与 CodeMirror Source
必须通过同一个 Text Document session/edit sequence 提交和接收 accepted source。Milkdown 内嵌
CodeMirror 只服务 fenced code block。无法无损保留语义的 Rich construct 必须保持原 source、
禁用受影响修改并提供 Source 入口；不得在打开文件时迁移或重写。

Text Editor 与 Canvas 复用同一个受控 Milkdown Surface，但不复用业务 Root 或 authority。Text Editor
adapter 继续拥有 edit-sequence queue、外部冲突和授权媒体 lease；Canvas adapter 只更新 exact `.nkc`
Markdown node。Canvas 节点默认显示紧凑只读所见所得，普通选中不进入源码输入；只有显式双击激活才
懒加载 Rich mutation，Escape 或离开选中态即释放该 Surface。

Agent text content 从首个 partial delta 到 final state 只能使用同一个 Agent message renderer。
Streamdown 2.5.0 已完成候选 spike：完成态 GFM、CJK、sanitize 和 stable block 通过，但 incomplete
emphasis、资源引用、semantic span、creative table、Mermaid 与 structured artifact parity 未通过，
因此不进入生产。当前 package-local normalized renderer 继续作为唯一 canonical path，不得并行注册、
feature flag 或 fallback。

Agent 创建或修改 `.md` 仍通过 Workspace-native file Tool 和 freshness/CAS；Agent renderer 不写
文件，Agent 不提交 Milkdown/CodeMirror transaction。发布后 Text Editor 从 authoritative file
reload，dirty session 则保留 buffer 并显示 external-change conflict。

## 资源引用

Markdown 只保存可移植的 Workspace 相对 target 或声明的稳定 resource/entity/artifact ref；不保存绝对
磁盘路径、cache path、`file:` URL、blob URL 或 Desktop resource URL。`@neko/markdown` 识别 `@`、
`[[...]]`、`![[...]]` 和 GFM authoring context，Text Editor 通过一个精确 Workspace/document/request
限定的 catalog 返回候选；Agent composer catalog 不参与该路径。

可见 Rich/Split 媒体由 Text Editor Domain 的 document/surface-qualified prepare/release contract
请求。Node owner 解析 Workspace 相对 locator 并分类 image/audio/video，Desktop Host 只负责
sender/path 授权和 `openneko://resource/<opaque-token>` 投影，Webview 只消费短生命周期 descriptor。
切换文档、移除 token 或卸载 surface 必须释放精确 lease；未知、歧义、陈旧、无权或不支持的引用显示
局部 diagnostic，并保留 Source 入口，不得回退 raw path、cache、Agent 或其他媒体 authority。

## Canvas handoff

`Send to Canvas` 创建 Agent-visible handoff intent，包含 source、stable refs、diagnostics、provenance、
user intent 和显式 target hint。它不直接调用 Canvas mutation。Agent 根据当前能力决定激活 Skill、
查询 Canvas context 并调用 Canvas-owned authoring capability。

Canvas 拥有 schema、资源绑定、节点创建、布局、validation 和项目写入。Markdown renderer 不猜测
active/recent Canvas，不生成私有 Canvas DTO，也不绕过 revisioned apply。

## 当前实施状态

`@neko/markdown` 已定义公共 GFM profile、extension declaration、conformance corpus、Rich
round-trip assessment、outline、reference projection 和显式 browser-only controlled Rich Surface。
Text Editor 与 Canvas 通过各自 adapter 复用该 Surface，且保留各自 authority。Agent core writer 已使用 freshness/CAS，
`.nkc`/`.otio` generic-file denial 和 Text Editor external-change watcher 已实施。Markdown Text
Editor 已使用 lazy Milkdown `Rich | Source | Split`，CodeMirror 继续拥有完整 Source 和其他文本；
Source 已组合 GFM snippet 与 Workspace mention/resource completion，Rich/Split 已从精确授权投影展示
CommonMark/`![[...]]` image、audio 和 video，并在可见 surface 生命周期内释放 lease。Agent 继续使用
`MarkdownStreamingSession` 与 package-local React renderer。Streamdown 仅为 dev spike，不是生产依赖
路径。

剩余可见 Desktop UI、Agent native-file 和 package gate 验收由
[`../../openspec/changes/adopt-gfm-authoring-and-agent-rendering-surfaces/`](../../openspec/changes/adopt-gfm-authoring-and-agent-rendering-surfaces/)
跟踪；本 ADR 只记录已经选定并实施的 canonical 边界。

## 验证

- shared conformance corpus 覆盖 GFM、extension、round-trip、partial delta、range、diagnostic 和
  finalization；
- Rich/Source/Split 测试证明同一 Text Document session、stale edit 拒绝和语义丢失 fail-visible；
- Agent renderer path 测试证明 partial/final 同一 surface，旧 renderer 和 fallback 被 poison；
- resource ref 测试证明路径和短生命周期 URL 不进入持久内容；
- handoff 路径断言先进入 Agent，再命中 Canvas public capability；
- streaming、资源展示、CSP 和编辑器交互使用真实 Electron Desktop fixture。

实现与选型证据见
[`../../openspec/changes/adopt-gfm-authoring-and-agent-rendering-surfaces/`](../../openspec/changes/adopt-gfm-authoring-and-agent-rendering-surfaces/) 和
[`../research/markdown-authoring-and-agent-rendering-options-2026-08-08.md`](../research/markdown-authoring-and-agent-rendering-options-2026-08-08.md)。
相关边界见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、
[`adr-agent-markdown-deliverable-authoring-and-canvas-projection-boundary.md`](adr-agent-markdown-deliverable-authoring-and-canvas-projection-boundary.md) 和
[`package-boundaries.md`](package-boundaries.md)。
