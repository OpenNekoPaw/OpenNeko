# ADR: Agent Markdown 创作产物持久化与 Canvas 投递边界

- 状态：Accepted，尚待实施
- 日期：2026-07-25
- 范围：`neko-agent` System Prompt、Skill、Capability/Tool、项目内容写入、Workspace Board、显式 Canvas、Generation 参数理解与 Agent Evaluation。

本文补充
[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)、
[`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md)、
[`headless-project-authoring.md`](headless-project-authoring.md) 和
[`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md)。

## 背景

Agent 的主要长期创作结果是企划、分镜草稿、分析报告、制作计划和素材生成提示词。这些内容需要跨会话复用、由用户直接编辑，并作为后续 Agent 执行的当前输入，因此其权威形态应是普通项目 Markdown 文件，而不是 Generation Job 记录、对话消息、Board 内嵌副本或领域结构 DTO。

当前实现尚未形成该路径：

- 具名 Markdown 主要通过对话内 `CompositeArtifact` 表达，再投影为 Board 内嵌 Markdown；
- 通用 `Write` 直接写文件，未返回稳定文档 artifact、`ResourceRef` 和内容 revision；
- terminal artifact delivery 依赖整个 Agent turn 成功，文件已经写入后若最终模型响应失败，Board 投递可能缺失；
- Skill 内容标准、自检要求和持久化意图没有统一约束；
- Generation Tool 暴露通用 schema，但 Agent 尚不能稳定获得当前 provider/model 的精确支持范围；
- 媒体 Tool 仍存在从固定 Markdown 章节提取字段并拼接 Generation request 的代码路径；
- Storyboard Skill 和 Webview/Types 中仍保留 `StoryboardTable`、`Scene`、`Shot` 结构化路径。

本 ADR 只定义创作 Markdown 的 canonical path。它不定义 Generation Job 页面、创作 Workflow、Markdown 字段 DTO 或 Storyboard 迁移实现。

## 决策

### 1. 项目 Markdown 是长期文本创作产物的权威

Agent 生成的长期企划、分镜文档、计划、分析和提示词文档应保存为普通、用户可编辑的项目 `.md` 文件。

以下内容不得成为该文档的权威或替代品：

- conversation transcript、最终回答或 Tool 卡片；
- Workspace Board 内嵌正文；
- Generation Job、Task、progress、approval 或 retry 状态；
- 隐藏推理、自检过程、prompt-chain 中间状态；
- `CompositeArtifact`、`StoryboardTable`、`Scene`、`Shot` 或新的内容字段 DTO；
- provider handle、完整 Tool schema、runtime handle、cache/Webview URI 或绝对本机路径。

Board/Canvas 只保存该 Markdown 文件的稳定引用和布局。项目 Markdown 文件保存成功后，即使 Board/Canvas 投递失败，文档仍然是有效产物。

### 2. Skill 负责创作规范，不负责运行时协议

需要生成长期 Markdown 的领域 Skill 使用自然语言约束内容，推荐包含：

```markdown
## Output Standard

最终文档应包含的章节、内容和表达方式。

## Quality Requirements

完整性、一致性、可复用性、证据和素材引用要求。

## Completion Checklist

保存前需要逐项检查的内容质量清单。
```

Skill 可以通过既有机器可读 metadata 声明：

```yaml
mediaWorkflow:
  producedArtifacts:
    - MarkdownDocument
  suggestedProjectors:
    - workspace-board
```

这些 metadata 只帮助 Agent 判断产物和建议投递面，不构成 Workflow DSL，也不定义文档字段。

Skill 正文不得包含：

- 具体 Tool 名称教程、命令名或参数表；
- 固定保存路径、Board 命令或 `ResourceRef` 协议；
- 轮询、Job、Task、审批、Webview 或缓存协议；
- Markdown 到 Generation request 的字段映射；
- 固定 stage、DAG、workflow node 或自动执行状态。

System Prompt 负责通用持久化纪律和 Tool 结果真实性；Capability/Tool schema 负责当前运行协议、参数和诊断；Host 负责路径授权和投递目标。

### 3. Agent 根据用户意图与 Skill 声明决定是否保存

只有同时满足以下条件时，Agent 默认将结果保存为长期 Markdown：

1. 用户要求创建、修订或交付可长期复用的创作内容，而不是普通问答或临时分析；
2. 当前 Skill 明确声明或其任务语义明确产生 `MarkdownDocument`；
3. 文档已经满足 Skill 的输出规范和完成检查；
4. 关键创作决策、事实来源和目标路径不存在未解决歧义。

普通问答、状态说明、Tool 诊断、一次性建议、运行日志和中间草稿不得自动写入项目。

若缺少会实质改变内容的关键决策，Agent 必须先询问用户，不得通过填充固定字段猜测答案。

### 4. 保存前由 Agent 自检并进行有限修订

Agent 在调用持久化 capability 前检查：

- 是否完整满足用户目标；
- 是否符合当前 Skill 的 Output Standard、Quality Requirements 和 Completion Checklist；
- 是否存在空泛、矛盾、重复、缺失或未经确认的事实；
- 文档是否脱离当前对话仍可理解和复用；
- 素材引用是否稳定、真实存在并说明用途；
- 素材生成提示词是否只使用当前 Generation capability 明确支持的语义；
- 是否错误包含 runtime 状态、隐藏推理、工具协议或结构化领域 DTO。

Agent 可以在同一普通 prompt-chain 中修订一至两次。系统不新增独立 self-review Job、validator workflow、checkpoint store 或隐藏 revision history。只保存最终 Markdown。

### 5. 新增语义明确的项目 Markdown authoring capability

不得给通用 `Write` 增加 Canvas 副作用，也不得继续把绝对路径结果当作文档 artifact。

项目 Markdown authoring capability 的最小输入为：

```text
title
markdown
optional workspace-relative path
optional expected content revision for an existing document
optional explicit Canvas target supplied by the current authorized request
```

具体 Tool 名称和 schema 由实施 OpenSpec 定义，不进入 Skill 正文。

该 capability 必须：

- 复用共享 `AuthorizedWorkspaceWriter`，执行工作区路径授权、原子写入、取消、大小限制和冲突检测；
- 只接受规范化 workspace-relative path，不持久化绝对路径；
- 新建时默认 fail-if-exists；更新时使用 expected fingerprint/revision，冲突必须 fail-visible；
- 返回稳定的文档 artifact transfer，其中只包含 artifact identity、title、workspace-relative locator、`ResourceRef` 和内容 revision；
- 将文档保存结果与 Board/Canvas 投递结果分别返回和展示；
- 不把 Markdown 内容解析成领域对象、Tool 参数或执行计划。

建议默认目录为 `neko/documents/`。用户显式指定的合法项目相对路径优先；Skill 不得硬编码该目录。

### 6. 文档 artifact 在 Tool result 持久化后进入投递

文档投递不得等待整个 Agent turn 的最终回答成功。

```text
Agent 生成并自检最终 Markdown
  -> Markdown authoring capability 原子保存
  -> 持久 Tool result 包含稳定文档 artifact
  -> Host 提交 Canvas delivery
  -> Agent 最终回答分别报告保存与投递结果
```

若文档已经保存，而后续模型连接、最终回答或 Board 投递失败：

- 不回滚或删除文档；
- 保留稳定 artifact identity 和 revision；
- Board delivery 可以保持 queued/blocked，并由 Canvas-owned coordinator 恢复或重试；
- 不得把 Board 失败描述为文档保存失败，也不得把文档保存成功描述为 Board 投递成功。

delivery identity 使用稳定 artifact identity 与内容 revision 保证幂等。投递 ledger 只保存副作用协调状态，不成为文档内容历史或创作记录。

### 7. 默认投 Workspace Board，显式 Canvas 禁止镜像

目标解析遵循唯一分支：

```text
当前请求携带已授权的显式普通 .nkc target
  -> 只投递该 Canvas
  -> 不镜像 Workspace Board

没有显式 Canvas target 且 workspace 唯一
  -> 投递 neko/boards/workspace.nkc

workspace 缺失、歧义或 target 非法
  -> 返回 blocked diagnostic
```

不得根据 active/recent Canvas、当前 Webview、文件名、会话历史或 UI selection 推断目标。Agent core 和 Skill 不保存 Canvas destination；显式目标只属于当前 request/Tool 调用和 Host composition。

Board/Canvas 使用现有 `file-reference` / Document 节点表达 Markdown 文档，不复制正文，不自动展开企划节点、分镜节点或专业领域结构。

### 8. Living document 在 Board 中保持一个文件引用

同一 workspace-relative Markdown 路径代表一个可持续编辑的 living document。内容 revision 用于：

- 写入冲突检测；
- delivery 幂等；
- stale 诊断；
- Agent 后续重新读取当前版本。

内容 revision 不应使同一 living document 在 Board 中持续产生重复卡片。Canvas 投影必须以稳定文件 locator 复用原 Document 节点，更新引用 observation 时保留用户位置、尺寸、连接、批注和其他布局事实。

不同路径、无法证明相同 locator 的文件或显式历史快照仍是不同内容。不得修改通用媒体 `ResourceRef` 语义来错误合并不同媒体 revision。

### 9. Generation 参数来自当前 capability，不来自 Skill 或 Markdown parser

Agent 生成图片、视频、音频或素材提示词时，必须读取当前 turn 实际注册的 Generation Tool schema、operation support、provider/model binding 和限制。

Capability/Tool context 应让 Agent理解：

- 当前可用的生成或编辑 operation；
- 当前模型支持的输入、参考、尺寸、时长、数量和控制项；
- unsupported、degraded、缺失 purpose binding 和成本/审批诊断；
- 哪些参数属于当前调用，哪些只是人类可读的创作意图。

Skill 只规定提示词的创作质量，例如主体、场景、构图、动作、风格、光影、声音、引用用途、保留项和禁止项。

必须删除或禁用以下新请求成功路径：

- 从 `taskMarkdown` / `planMarkdown` 固定标题提取字段；
- 把 Markdown 编译为 `GenerationIntent`、Workflow 或 request DTO；
- 由代码将分镜表字段转换为生成参数；
- Skill 保存 provider/model、完整 schema 或参数表。

后续执行时，Agent重新读取当前 Markdown 和当前 capability schema，并直接形成普通 Tool Call。Markdown 始终是人类可编辑内容，不是 executable state。

### 10. 新路径不得依赖 Storyboard 结构 DTO

分镜产物保存为普通 Markdown，可以使用表格，但表头只是文档表达，不是持久字段契约。

新路径不得创建、要求或转换：

- `StoryboardTable`;
- `Scene`;
- `Shot`;
- `scenes[] -> shots[]`;
- scene/shot 专用 Webview transfer；
- Storyboard-to-Generation 字段映射。

现有类型、历史 `.nkc` 节点和 renderer 的删除不属于本 ADR 的直接实施范围。后续清理必须先审计已有项目数据和历史读取需求；在清理完成前，旧数据可以保持只读兼容，但不得成为新 Agent 请求的成功 fallback。

### 11. 不建立自动 Workflow

唯一创作执行循环继续是普通 Agent ReAct/prompt-chain：

```text
理解目标
  -> 读取实际资料
  -> 加载适用 Skill
  -> 检查当前 capability
  -> 生成内容
  -> 自检和有限修订
  -> 保存项目 Markdown
  -> 投递 Board/Canvas
  -> 根据真实结果继续对话
```

不得新增 Workflow Engine、Markdown compiler、task graph、固定 stage、Plan-to-Apply runtime、创作专用 checkpoint 或自动执行页面。领域 Job 只管理单次生成、导出等具体异步操作，不管理整个创作过程。

## 职责与依赖

| 层               | 拥有职责                                               | 不拥有                               |
| ---------------- | ------------------------------------------------------ | ------------------------------------ |
| System Prompt    | 通用持久化、自检、真实性和失败反馈纪律                 | 领域模板、工具参数、Canvas 私有协议  |
| Skill            | 创作方法、输出标准、质量要求、完成检查                 | Tool 教程、路径、Job/Board 协议      |
| Agent            | 理解意图、生成、自检、选择当前 Tool                    | 文件 IO、Board 状态、隐藏 Workflow   |
| Capability/Tool  | schema、validation、授权写入、稳定 artifact result     | 创作内容字段、从 Markdown 猜测执行   |
| Host composition | workspace、显式 target、Tool result 到 delivery 的连接 | 创作内容权威、active/recent fallback |
| Canvas domain    | delivery ledger、目标写入、幂等投影、布局保护          | Markdown 正文权威、Agent transcript  |
| 项目 `.md` 文件  | 长期可编辑创作内容                                     | Job、审批、Tool 或 Board 运行状态    |

依赖方向保持：

```text
Skill/System Prompt -> Agent decision
Agent -> public Capability/Tool contract
Capability/Tool -> AuthorizedWorkspaceWriter
Host -> public Canvas delivery port
Canvas -> file-reference ResourceRef
```

Agent core 不导入 Canvas implementation；Webview 不读写工作区；Canvas 不解析 Skill 或 Markdown 创作语义。

## 迁移与兼容

- 现有项目 Markdown、生成素材、设置和用户数据不得删除或静默改写。
- 现有 Board 内嵌 Markdown 节点保持可读，不自动转换成文件，也不从 delivery history 重建。
- 现有 CompositeArtifact 可以保留为历史消息/render 输入，但新长期 Markdown 产物不得默认走该路径。
- 现有 Storyboard/Scene/Shot 数据在独立迁移前保持可读；新路径必须通过测试证明不会命中其 authoring、transfer 或 Generation fallback。
- 通用 `Write` 继续服务显式普通文件编辑，但不声明 durable creator artifact，也不触发 Canvas 投递。

## 验证要求

实施必须创建独立 OpenSpec，建议命名为 `persist-agent-markdown-deliverables`，并至少覆盖：

1. Skill/Prompt 防回流测试：Skill 不包含 Tool 名、参数表、保存路径、Board/Job 协议。
2. authoring contract、授权路径、原子写入、冲突、取消和稳定 `ResourceRef` 测试。
3. Tool result 持久化后投递、最终模型失败后文档仍存在、Board 失败不回滚测试。
4. 默认 Workspace Board、显式 Canvas no-mirror、无 active/recent fallback 路径测试。
5. living document 更新不重复创建 Board 节点并保留用户布局的测试。
6. StoryboardTable/Scene/Shot 和 Markdown-to-request legacy path poison 测试。
7. 聚焦真实 Agent Evaluation：主动保存、普通问答不保存、自检质量、当前 Generation capability 参数理解和失败反馈。
8. Extension Development Host 验收：保存状态、投递状态、Document 卡、打开文件、显式 Canvas、失败诊断和 Webview 消息；普通浏览器不得替代。

现有 `unify-agent-workspace-board-delivery` 的 pending delivery 恢复、完整 Extension Development Host 场景和 Webview CDP 保存验收是本 ADR 实施的前置运行边界，不得仅凭单元测试宣称闭环。

## 后果

正面结果：

- 长期创作内容成为普通、可搜索、可编辑、可复用的项目文件；
- Board 保持创作关系和布局视图，不再复制正文或拥有第二份内容事实；
- Skill 可以持续演进内容标准，而无需修改 DTO 或 renderer；
- Agent 每次执行都使用当前 capability，不受旧文档中保存的 provider/schema 约束；
- 文档保存、Canvas 投递和领域 Job 的失败边界清晰且可独立恢复。

代价与风险：

- 需要新增最小文档 artifact transfer 和 Tool result 级投递接点；
- living document 的 Canvas identity 必须与媒体 revision identity 分开处理；
- builtin Skills、System Prompt、Agent Evaluation 和 Storyboard legacy guard 需要同步更新；
- 当前 Workspace Board 的剩余运行态验收必须先完成，否则新文档投递会建立在未完全闭环的基础上。
