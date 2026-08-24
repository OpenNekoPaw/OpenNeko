# Agent Skill、Prompt 与 Pi 迁移审计

日期：2026-08-17

状态：当前实现与迁移决策输入，不是新的稳定架构事实。稳定边界以
[`docs/architecture/agent.md`](../architecture/agent.md) 和
[`docs/architecture/adr-pi-agent-runtime.md`](../architecture/adr-pi-agent-runtime.md) 为准；清理实施见
[`remove-legacy-agent-skill-activation-protocol`](../../openspec/changes/archive/2026-08-21-remove-legacy-agent-skill-activation-protocol/)。

## 结论

Pi 只应完整接管通用 Agent execution：Agent loop、Pi Session transcript/context、Skill discovery/format/read、Tool 调度与主模型请求。OpenNeko 的产品 owner 不应废弃：Skill roots/source/trust/enablement/fingerprint、每 turn immutable snapshot、Conversation/queue/permission/approval、Capability registry、领域 Job、Desktop IPC 与 Timeline/Webview projection 仍必须由对应 package 管理。

旧自研 lifecycle 中可废弃的是第二套 Skill activation slot、ToolSet/injection/category/tier、无生产 producer 的 activation-progress UI，以及 `GetContext`/`ActivateSkill`/`DeactivateSkill` 假协议。Conversation、Turn、后台 Job、真实 capability lifecycle 不是这些旧 Skill 协议的一部分，不能随迁移删除。

## 附件问题复盘

附件中的 Agent 面对 402 页图像型漫画，只读取目录、封面、卷首标题页和部分代表页，就输出了篇幅很长的完整动画企划。回复虽声明证据有限，但仍把局部观察扩展为大量主题与改编判断，并且产物只留在对话中。

这包含两个不同 owner 的缺口：

1. **复杂素材处理缺口**：长文档、漫画和长视频需要先建立 coverage plan，按章节/页段/镜头采样，生成可追踪证据索引，识别未覆盖区间，再分阶段综合；不能靠“从头到尾一次读完”，也不能靠少量代表页直接外推完整结论。
2. **产物持久化缺口**：当用户要求企划、文案或文档时，需要在开始前确定 deliverable 与保存位置，写入 authoritative 文档并返回稳定引用；聊天长文只可作为简短摘要或审批预览，不能伪装为已经保存的交付物。

Prompt 只能要求 Agent 遵循这些规则，不能单独补齐 coverage index、文档 authoring port、artifact identity 和保存确认。前者需要素材 owning package/Capability 提供分段读取与证据 contract，后者需要文档 owning path 提供写入结果与稳定 artifact/file identity。

## 当前 Prompt 注入

| 注入层                     | 当前 owner                                    | 内容                                                                                 | 不应承担                                              |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| System Prompt              | `packages/agent/runtime/src/prompt`           | 通用行为、Markdown/视觉证据、安全、失败处理、真实 Tool 列表、Pi Skill 选择/read 规则 | 领域工具参数、Skill slot、子包 authoring schema       |
| Pi Skill catalog/read      | `packages/agent/runtime/src/pi`               | Skill metadata 常驻；完整正文只经 `read_skill` 渐进读取；receipt 进入 Pi transcript  | Tool/permission/workspace trust 授权                  |
| Capability prompt fragment | owning provider + `CapabilityRegistryRuntime` | operation、schema、diagnostic、资源与 Host requirement                               | 通用人设、创作方法论                                  |
| Skill content              | `packages/skills/skills/*/SKILL.md`           | 领域方法、判断、创作语义、输出标准                                                   | 具体工具名教程、轮询协议、IPC/path/cache/Webview 协议 |
| Evaluation                 | `scripts/agent-eval`                          | Scenario、hard gate、真实 Desktop path 与证据解释                                    | 产品 Skill、第二套 Agent controller                   |

生产 system Prompt 现只描述 Pi catalog、`$skill-name` 精确选择、自然语言匹配和 `read_skill`。旧 `GetContext`、`ActivateSkill`、`DeactivateSkill`、slot/active record 文案已删除并由 poison/absence 测试约束。

## 当前 builtin Skills

当前 `packages/skills/skills/` 有 15 个 builtin Skills：

| 能力类           | Skills                                                                                                         | 当前覆盖                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 素材分析与综合   | `media-production`、`media-quality-review`、`storyboard`                                                       | 已要求读取真实来源、区分事实/解释/决定并按证据工作；尚缺通用长素材 coverage/index orchestration contract     |
| 企划、文案与文档 | `script-generation`、`storyboard`、`character-creator`、`world-creator`、`skill-creator`                       | 已有创作方法与部分 owning-domain 保存语义；通用“用户要求文档时必须落盘并返回稳定引用”仍需独立 authoring 设计 |
| 图片生成与编辑   | `image`、`media-production`、`media-quality-review`                                                            | Skill 负责意图、约束与复核；实际执行取决于当前 turn 的 image capability/model binding                        |
| 视频生成与转换   | `video`、`media-production`、`media-quality-review`                                                            | Skill 负责单片段生成/转换与结果复核；异步 Job、provider 与 artifact 由 Generation owner 管理                 |
| 视频剪辑与后期   | `video-editing`、`script-to-timeline`、`subtitle-assistant`、`audio-mixing`、`color-grading`、`scene-to-music` | Skill 负责方法和 handoff；Cut/媒体 owning capability 负责项目 mutation、revision、export 与验证              |

Skill 存在不等于能力可执行。每个 turn 只能使用 immutable Tool/model/permission snapshot 中真实注册的 capability；缺失时必须 blocked，不能从 Skill 文案推断 provider 或工具存在。

## 建议补齐的独立变更

### 长素材分析

建立一个 owning-domain、格式无关的 evidence coverage contract，而不是新增“万能分析 Skill”：

- 输入是稳定素材 identity、结构索引和用户问题；
- planner 生成分段/采样计划与预算，漫画按目录/章节/页段，视频按时间段/镜头，长文档按 section/page；
- 每条观察绑定 source segment，记录已覆盖、未覆盖、失败和抽样理由；
- synthesis 只能引用已覆盖证据，完整性声明由 coverage 数据计算；
- 中断后从同一计划/证据继续，不重复分析，也不把旧摘要当 authoritative source；
- Skill 只定义不同素材的分析方法和质量标准，Capability 定义读取/索引/证据 schema。

### 文档自动保存

建立显式 deliverable policy，而不是让 system Prompt 猜测所有长回复都要写文件：

- 用户明确要求企划、方案、报告、脚本或文档时，在执行前解析 artifact kind、格式和目标 owner；
- Project scope 写入已授权 workspace 的 canonical 文档路径，Assistant scope 写入用户级 artifact owner；
- 写入成功必须返回稳定 identity/path 与 validator 结果，失败则保持聊天摘要但明确“未保存”；
- 普通问答、短建议和用户只要求预览时仍在聊天回复，不产生隐式文件；
- 后续编辑绑定原 artifact identity，不用最近文件或 active workspace fallback。

这两个目标 owner、contract 和验收边界不同，应分别创建 OpenSpec，不能塞回本次旧协议清理 change。

## 开源参考

以下来源于 2026-08-17 的仓库/API 与当前依赖元数据核对：

- [earendil-works/pi](https://github.com/earendil-works/pi)：当前 `@earendil-works/pi-agent-core@0.80.7` 的上游，可参考 Agent loop、Session、Skill discovery/read 与工具调度，不应复制其 CLI/TUI lifecycle 到 Desktop product owner。
- [anthropics/skills](https://github.com/anthropics/skills)：可参考 Skill 包结构、渐进披露、脚本/资源分离和复杂 artifact workflow；宿主工具名与权限协议不得进入 OpenNeko Skill 正文。
- [openai/skills](https://github.com/openai/skills)：可参考 Codex Skill catalog、文档/PDF/表格/演示文稿等 artifact skill 的“指令 + 脚本 + render/verify”组织方式。
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)：可参考 MCP server/tool schema 与资源边界；它不是 Prompt 或 Skill lifecycle 的替代品。
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)：只适合参考 durable graph/checkpoint/interrupt 的测试思想。OpenNeko 是本地 Electron 产品，已有 Pi Session 与领域 Job owner，不应为了长素材分析另建通用 Agent controller 或第二套 checkpoint authority。

建议吸收的是契约化渐进披露、可恢复分段、artifact render/verify 与可执行评测；不建议复制超长 system prompt、工具名教程、隐式 fallback、全局 workflow graph 或第二套 session/memory。

## 不确定性

- 本文没有运行 provider-backed 漫画/视频长素材案例；附件只证明当前用户体验问题，不证明唯一根因。
- 当前 key-free Evaluation 能验证 schema、fixture 与 forbidden-path gate，但不能证明真实模型会稳定执行 coverage 或保存文档。
- 长素材 coverage 与通用文档保存仍需独立 OpenSpec、真实 capability contract、visible Desktop UI 路径和 provider-backed Evaluation 后才能声明闭环。
