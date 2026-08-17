# Markdown 内容编辑与 Agent 渲染方案调研

日期：2026-08-08

结论状态：选型输入；实施约束见
[`../../openspec/changes/adopt-gfm-authoring-and-agent-rendering-surfaces/`](../../openspec/changes/adopt-gfm-authoring-and-agent-rendering-surfaces/)。

## 结论

OpenNeko 应采用三个明确分工的浏览器表面，而不是一个组件覆盖所有 Markdown 场景：

| 表面                   | 采用方案                                                          | 唯一职责                                           |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| 内容编辑器 Rich        | Milkdown + `@milkdown/preset-commonmark` + `@milkdown/preset-gfm` | `.md` 的结构化、所见即所得编辑                     |
| 内容编辑器 Source      | CodeMirror 6                                                      | Markdown 源码及其他普通文本格式编辑                |
| Agent Webview 文本消息 | Streamdown 2.5.0                                                   | 同一消息从不完整 token 流到最终文本的连续 GFM 渲染 |

Workspace `.md` 文件保持唯一 authority。`@neko/markdown` 保留为 OpenNeko GFM profile、source
range、outline/reference/diagnostic、扩展语义和跨表面 conformance owner，不成为用户可见的
“Neko Markdown”方言。Tool、Approval、Artifact、媒体和领域结果继续使用 typed renderer，不进入
Markdown text renderer。2026-08-17 的边界收窄与复核后，Streamdown 2.5.0 已原子成为唯一生产注册。

## 规范基线

[GitHub Flavored Markdown Spec 0.29-gfm](https://github.github.com/gfm/) 是公开规范，基于
CommonMark 并定义 autolink literal、strikethrough、table、task list item 和 tagfilter 扩展。
正式 strikethrough 允许一对或两对 `~`，因此 OpenNeko 不应关闭 single-tilde 行为后再宣称严格
GFM。reference link 和 fenced code 属于 CommonMark 基线。

脚注、Mermaid、Math、`@mention`、`![[resource]]` 和 Workspace 资源链接不属于 0.29-gfm。
它们必须作为独立 extension 声明，并分别定义 round-trip、安全、缺失 renderer 和 diagnostic
行为。Raw HTML 可以保留在 source/semantic projection 中，但默认不得作为可信 DOM 执行。

## 方案对比

### 内容编辑器

| 方案            | 优势                                                                                           | 限制                                                                                     | 判断                  |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------- |
| Milkdown 7.22.0 | ProseMirror 文档模型、Markdown 序列化、GFM preset、表格/任务列表/删除线、可组合命令与 NodeView | Rich 编辑会规范化 Markdown 字面形式；扩展节点必须逐项定义 round-trip；不是通用源码编辑器 | Rich/WYSIWYG 首选     |
| MDXEditor       | React 集成直接，工具栏和常见 Markdown/MDX 能力完整                                             | MDX 是比 GFM 更大的语言面；Lexical/MDX 扩展会扩大 OpenNeko 文件契约和 Agent 输出约束     | 不选作 GFM 主编辑器   |
| CodeMirror 6    | 成熟源码编辑、IME、selection/history、语法高亮、适合多种文本格式                               | 不提供所见即所得 Markdown 文档模型                                                       | Source 和普通文本首选 |

Milkdown 的 CodeMirror 能力位于 code-block component/Crepe CodeMirror feature，只编辑 fenced
code block 内部内容。它不能替代完整 `.md` Source 模式，也不能承担 JSON、YAML、Fountain、TXT
和 HTML。因此 Text Editor 仍需独立 CodeMirror 6。

### Typora 与 Mark Text 的不完整输入处理

Typora 是闭源产品，无法从公开资料确认内部 parser 或增量算法。其官方 Markdown Reference
能确认的用户行为是：span syntax 在输入后立即解析，而光标进入 span 时再展开 Markdown 源码；
标题、引用、列表、代码围栏和表格也在满足触发条件后转换为对应块。可观察语义是“输入中的局部
构造逐步成立”，而不是先要求整份文档通过一次可逆序列化验证。

Mark Text 的公开实现使用 Muya。观察 `packages/muya/src/state/markdownToState.ts`、
`inlineRenderer/index.ts` 和 block 实现可见：Markdown 先转换为 block state，空或未识别内容有
明确 paragraph state；inline tokenizer 针对当前 content block patch DOM，编辑操作也在块级转换。
因此未闭合 inline 标记或尚未成形的 block 可以继续作为当前段落文本存在，不会因为一个局部输入
清空其他 block 的展示。

OpenNeko 不复制 Muya，也不推断 Typora 的闭源实现。对应产品约束是：CodeMirror 始终保存完整
源码；Milkdown 对 CommonMark/GFM 的容错 parse 始终可以形成展示投影；Split 的右侧投影只读，
不会把自动补齐或规范化结果写回源码。若 Milkdown 序列化不能保持扩展语义，只冻结 standalone
Rich mutation 并显示局部 diagnostic，同时保留已解析内容和 Source 操作。

### Agent Webview

| 方案                   | 流式不完整语法                                                 | GFM/插件                                      | React/安全                                        | 判断                                              |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Streamdown 2.5.0       | 以 `remend` 处理未闭合块，面向 AI stream，支持 memoized blocks | 内置 remark-gfm，可扩展 Neko text/media 语义  | React；包含 sanitize/harden 能力                  | Agent streaming/final 唯一生产 renderer           |
| unified + remark-gfm   | 语义精确、AST 和插件生态强                                     | 最适合 canonical parse/profile                | 需要自行实现 React streaming UI、安全和增量稳定性 | `@neko/markdown` core 首选，不单独作为成品消息 UI |
| react-markdown         | 静态 React Markdown 成熟，remark/rehype 可组合                 | GFM 需插件                                    | 默认不执行 raw HTML                               | 静态展示合适，但没有专门的不完整 stream 生命周期  |
| markdown-it 15         | CommonMark、插件丰富、HTML string 输出直接                     | GFM 行为依赖插件组合                          | React 映射、sanitize 和增量稳定需另建             | 不选 Agent 主层                                   |
| marked 18              | 小而快、API 简单                                               | GFM 风格解析容易接入                          | 官方明确不负责 sanitize；HTML string 还需安全边界 | 不选 Electron Agent renderer                      |
| micromark 4            | 低层 tokenizer 精确、适合构建 parser                           | 扩展可组合                                    | 不是现成 React streaming UI                       | 仅适合底层实现                                    |
| streaming-markdown 0.2 | 轻量增量 DOM                                                   | 生态和复杂扩展覆盖较窄                        | 需要更多宿主集成验证                              | 适合 spike/demo，不作为首选                       |

Streamdown 不是叠加在旧 Agent `MarkdownRenderer` 外层的装饰组件。2026-08-17 的实施在 Agent
message owning boundary 内原子替换 parser/presenter/registration/fixtures；streaming 和 final
始终命中同一 Streamdown surface，旧 streaming core 与 renderer 已删除。

实测中，Streamdown 通过完成态 GFM、CJK、hostile HTML/URL sanitize 与 completed-block identity；
早期 spike 未闭合 emphasis 的即时语义与 OpenNeko resource/structured parity 未通过；这是当时
反对把所有业务 presentation 压入 Markdown 的有效证据。新边界将 typed artifact、creative table、
Tool、Approval 和领域结果移出 Markdown，并由 package-owned remark plugin/custom component 接入
资源引用，因此原 no-go 不再阻止 Streamdown 承担纯 Agent text renderer。旧 bundle 测量仍仅作为
2026-08-08 的历史数据，不代表当前构建预算。

## OpenNeko 适配风险

- 当前 Agent renderer 除 GFM 外还处理 Mermaid、资源引用、semantic prompt span、creative table、
  composite content 和 Canvas handoff；Streamdown custom components/remark plugins 必须覆盖这些
  真实消费者，不能只验证普通聊天文本。
- Streamdown 2.5.0 同时依赖 `marked` 与 unified/remark 生态。其内部路径是第三方实现细节，
  OpenNeko 不能依赖内部 AST；验收应约束可观察行为和唯一注册路径。
- Milkdown Rich round-trip 可能改变空白、列表标记、表格布局等源码拼写。允许的规范化必须明确，
  未支持节点必须阻止 Rich 修改并引导到 Source，不能静默丢失用户内容。
- Milkdown components 当前包含 Vue 运行依赖；应优先使用 React 友好的 core/preset/NodeView 组合并
  测量实际 lazy chunk，不能因一个 code-block component 把无关 UI runtime 引入 Text Editor。
- CJK 表格宽度、长链接、IME、代码块、滚动锚点和可访问性必须在真实 Desktop Webview 验证。

## Spike 通过条件

1. 官方 GFM corpus 与 OpenNeko fixtures 在 Milkdown、CodeMirror preview semantics、Streamdown 和
   `@neko/markdown` 之间具有声明的等价结果。
2. incomplete emphasis、link、fence、table、list 和 CJK 文本流不会闪烁、回退或重建稳定块。
3. 流式到最终状态保留 message/content-block identity、滚动锚点和交互状态，不切换 renderer。
4. Raw HTML、危险 URL、图片和 Mermaid 输入在 Electron CSP 下 fail-closed，错误局部可见。
5. Neko resource/mention/semantic annotation 由 package-owned extension/projector 接入，不 fork
   Streamdown，也不经 ad hoc source rewrite。
6. Milkdown Rich 与 CodeMirror Source 共用一个 Text Document session；模式切换、Split、undo、
   外部 Agent 写入和 dirty conflict 不产生第二份 authoritative buffer。
7. lazy chunk、首次渲染、持续 token 更新和长文档内存达到实现前设定的 Desktop 预算。

## 来源与不确定性

主要来源访问日期为 2026-08-08；Typora 与 Mark Text 补充核对日期为 2026-08-09：

- [GFM Spec 0.29-gfm](https://github.github.com/gfm/)，CC BY-SA 4.0。
- [cmark-gfm](https://github.com/github/cmark-gfm)，GitHub 的 C 参考实现，BSD-2-Clause。
- [remark-gfm](https://github.com/remarkjs/remark-gfm)，MIT；当前仓库已使用 4.0.1。
- [Milkdown](https://github.com/Milkdown/milkdown)，MIT；npm 观察版本 7.22.0。
- [Milkdown GFM preset](https://milkdown.dev/api/preset-gfm) 与
  [Code Block component](https://milkdown.dev/api/component-code-block)。
- [MDXEditor](https://github.com/mdx-editor/editor)，MIT。
- [CodeMirror](https://codemirror.net/)，MIT；当前 Text Editor 已集成 CodeMirror 6 modular packages。
- [Typora Markdown Reference](https://support.typora.io/Markdown-Reference/)；Typora 为闭源产品，本文仅记录公开可观察行为，不推断内部实现。
- [Mark Text](https://github.com/marktext/marktext) `develop` 分支及其 `packages/muya` block-state、Markdown-to-state 与 inline renderer 实现，MIT。
- [Streamdown](https://github.com/vercel/streamdown)，Apache-2.0；npm 观察版本 2.5.0。
- [react-markdown](https://github.com/remarkjs/react-markdown)、
  [markdown-it](https://github.com/markdown-it/markdown-it)、
  [marked](https://github.com/markedjs/marked)、
  [micromark](https://github.com/micromark/micromark) 和
  [streaming-markdown](https://github.com/thetarnav/streaming-markdown)。

版本、bundle、插件 API 和上游安全实现会变化。本文的版本号是调研时观察，不是产品 manifest
约束；最终依赖必须在 OpenSpec 实施时固定，并通过 license、CSP、bundle 和行为验证。
