## Context

DSH 只提供 Markdown assistant message。产品必须在不要求模型输出 JSON envelope 的情况下，区分普通回复与长期创作产物。Content Tool 完成后的章节/图片来源投影已经由独立的 completed-tool 链处理，本变更不得把这些来源重新聚合到 terminal 文档，也不得等待 turn 结束后重复投影。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | DSH Bridge 定义通用输出语法；Agent Runtime 决定 Workspace 准入、解析、文档 identity 和 workflow；Desktop 只实现 Host 文件 authority；Canvas 只消费 locator projection。                   |
| Dependency     | Host-neutral parser/workflow 不依赖 Electron、Node writer 或 Canvas Webview；Desktop adapter 依赖精确 Workspace restoration 和授权 writer。                                               |
| Interface      | Agent 继续输出 Markdown。唯一边界是独占行 `<!-- neko:artifact -->`；Host 内部投影为 `summaryMarkdown` 和可选 `reviewable-markdown` artifact。                                             |
| Extension      | `DocumentProfileId` 由 Host 准入并校验；默认 profile 可由当前 Skill 收紧内容规范，但 Skill 不拥有 marker、路径、工具或写入协议。                                                          |
| Test           | Pure parser、prompt/context、workflow producer、Desktop writer/consumer、session projection 和 Agent evaluation 分层验证；路径测试证明不恢复 CompositeArtifact 或 whole-reply auto-save。 |

## Goals / Non-Goals

**Goals:**

- 保持 Agent Markdown-native 输出和普通对话体验。
- 只有显式、已准入的长期文档被写入精确 Workspace。
- 文件写入成功后立即投影到本轮绑定的 Canvas target；Canvas 不可用时文件仍保留并返回可见 diagnostic。
- 对同一文档重复处理保持幂等，不重复创建文件或节点。

**Non-Goals:**

- 不恢复 CompositeArtifact、CompositeContent 或 JSON terminal envelope。
- 不自动保存失败、中断、max-token 或无显式产物分隔符的回复。
- 不把普通 Agent 总结、工具日志或来源使用记录写入文件。
- 不改变 Webview 布局或新增第二套 Canvas 写入接口。

## Decisions

### 1. Markdown-native terminal contract

最终文本在 fenced code block 之外最多包含一个独占行 `<!-- neko:artifact -->`。分隔符之前是始终展示的 `summaryMarkdown`；之后是可选长期文档，必须以一个非空 H1 开始。标题从 H1 派生，profile 来自 Host 的 turn admission，而不是模型 JSON。

没有分隔符时文本是普通回复。未准入上下文出现分隔符、重复分隔符、空总结、空文档或缺少 H1 时，当前产物投递 fail-local；原始 transcript 仍保留，且不得写文件或影响其他 turn。

### 2. 准入与 Skill 覆盖

Workspace context 默认准入 `reviewable-markdown` profile，并提示 Agent 仅在形成长期、可复用、命名的创作产物时使用分隔符。普通问答、过程状态、失败说明和短总结不得产生 artifact。

当前 Skill 可以规定更严格的章节、字段、证据、语言和创作模板；系统协议仍拥有 marker、单一 H1、Markdown 格式和 Host 持久化边界。Assistant、Character、World/Room 不默认准入，只有未来明确的用户保存操作才能由其 owner 增加精确 admission。

### 3. 稳定路径和唯一写入链

Agent Runtime 对 `profile + title + markdown` 计算稳定 hash，并在 canonical generated Markdown 目录生成 Workspace 相对路径。Desktop 使用精确 `workspaceId` 恢复 authority，通过授权 writer 执行 `fail-if-exists`：同路径已有相同 bytes 视为幂等成功，不同 bytes 明确冲突。

Agent 不决定 Host 绝对路径，也不调用随机沙箱目录；Desktop 不复制 Agent 临时文件。文件内容仅为规范文档，不包含对话总结。

### 4. 文件成功后复用 Board delivery

publication 成功后，Agent Runtime 创建一个 `file-reference` analysis artifact，携带 Workspace `ContentLocator`、`text/markdown` mime type 和稳定 artifact identity。Desktop 复用现有 `DshWorkspaceBoardArtifactDeliveryPort`，投递到该 turn 已绑定的 `CanvasWorkspaceTurnTarget`。

terminal delivery 不重新投影 document 章节、图片或来源父节点；这些继续在 Content Tool 成功时即时处理。这样避免 terminal 阶段重复章节/图片和图膨胀。

### 5. 会话展示总结和持久文档引用

DSH streaming message 保持原始文本。最终 assistant event 使用同一个 parser：合法 artifact 输出投影 `summaryMarkdown`，并在精确 Workspace Markdown 已发布且 bytes 与终态 artifact 匹配后附带一个稳定 `ContentLocator` 引用；普通回复原样投影。若 terminal contract 非法或文件尚未成功发布，会话不得伪造可打开引用，原始文本或摘要仍按当前失败语义保留，并由 artifact workflow 报告明确 diagnostic。

持久引用不是进程内 publication 回执。Agent Runtime 从 canonical terminal artifact identity 派生同一 Workspace 相对路径，并通过 publication port 校验当前文件；完整 owner/应用重开后仍用终态消息、精确 Workspace context 和持久文件重建引用。Renderer 只提交 conversation/message identity，Desktop Main 重新解析并授权精确 `ContentLocator` 后调用现有 Markdown 编辑器打开路径；不得把绝对路径、临时 preview session 或 Renderer 提供的 locator 当作 authority。

用户消息中的文件是输入来源，继续使用既有 attached reference token。assistant 终态 artifact 是已发布的输出文档，必须在总结之后使用一个轻量文件链接呈现：文件图标和可读标题共同构成同一点击目标，不额外显示保存状态、路径或独立打开按钮。链接继承会话正文的字号、行高和常规字重，不使用常驻下划线或 hover 透明度制造第二层强调；只有 hover/focus 时显示下划线反馈，并与总结保持紧凑间距。完整 Workspace 相对路径只作为悬停详情和打开所需 locator 的可读投影。该链接复用同一 sender-bound open action，不把路径重新注入 `summaryMarkdown`，也不新增 artifact authority。

## Boundary inventory

| Owner / role                      | Canonical path                                                     | Producer -> consumer                                                                 | Runtime boundary              | Replaced path / user-data impact                                                     |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| `@neko/dsh-bridge` L0 prompt      | product system prompt                                              | Host prompt -> DSH Agent                                                             | provider prompt boundary      | 删除 dangling CompositeArtifact JSON 指令；无数据迁移                                |
| `@neko/agent-runtime` application | terminal Markdown parser + publication resolver + delivery service | final projected event -> publication/delivery ports                                  | host-neutral Node/application | 替代 whole-final heuristic；普通回复不落盘；重开时从终态 artifact 和持久文件重建引用 |
| `@neko/agent-runtime` context     | DSH conversation turn context                                      | exact Workspace binding -> turn admission prompt                                     | session context boundary      | 非 Workspace 不默认准入                                                              |
| `apps/neko-desktop` Main adapter  | existing Workspace Board delivery                                  | publication request -> authorized Workspace writer -> Canvas projection              | Electron trust boundary       | 新文件为 Workspace 相对路径；不覆盖不同内容                                          |
| Canvas domain/Webview             | existing locator-backed file node                                  | delivery request -> current bound board                                              | typed IPC/Webview             | 无 contract/UI 变化                                                                  |
| Agent contract/Webview            | optional terminal Markdown reference                               | projected final message -> dedicated durable-document link -> sender-bound Host open | typed IPC/Webview             | 输入文件仍使用 reference token；不复制完整文档；不持久化 preview session             |

## Risks / Trade-offs

- 模型可能错误输出 marker：strict parser fail-local，并用 evaluation 覆盖普通回复与长期文档两类行为。
- 模型可能把 marker 写入代码示例：parser 只识别 fenced code block 外的独占行。
- 文件写入成功但 Canvas target 失效：保留 durable 文件，返回 Board blocked diagnostic；不回退到 active/recent Canvas。
- Skill 规范冲突：运行时协议优先拥有边界语法，Skill 只收紧文档内容结构。

## Migration Plan

1. 添加 terminal parser/contract 和 Workspace admission prompt。
2. 扩展现有 delivery service 与 Desktop publication adapter。
3. 在 turn/end 释放 Canvas admission 前完成 terminal publication/projection。
4. 更新会话最终投影和测试，删除失效 CompositeArtifact prompt。
5. 为最终消息补充发布后可用的持久 Markdown locator 和精确 Host 打开动作。
6. 增加 Agent evaluation 并运行 focused build/test。

不保留旧 whole-reply 自动保存或 CompositeArtifact 成功路径；回退代码不会删除已生成的用户文档。

## Open Questions

无 apply-blocking open question。
