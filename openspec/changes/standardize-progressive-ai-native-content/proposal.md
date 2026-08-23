## Why

当前内容创作 Skill 和 Evaluation 经常要求一次性输出完整结构、全部字段、多个备选方案和长篇说明，导致普通请求也生成大型文档。不同 Skill 又各自定义表格、章节和模型使用说明，使分析报告、企划书、计划步骤、提示词等产物缺少统一的渐进深度与 AI-native handoff 语义。

这些问题属于产品默认输出行为和内容方法论，不属于 DSH Skill 格式。设计必须利用 DSH 的渐进 catalog/body/resource 加载与多 Skill组合，不能通过限制 Skill 数量或重写 DSH router 来解决。

## What Changes

- 在 OpenNeko product system prompt 中加入跨任务的渐进输出规则：默认交付最小可用结果，用户明确要求后再扩展细节、备选和完整执行方案。
- 新增一个普通、可组合的 builtin `content-authoring` Skill，提供跨领域内容设计方法；它不是 mandatory gateway，也不排斥同时加载 storyboard、media-production 等领域 Skills。
- 让 `content-authoring` 的 DSH 目录描述同时覆盖中英文常见创作意图，并通过不带 `$content-authoring` 的真实 case 验证模型可从原生 Skill 目录隐式选择；不新增 OpenNeko router 或强制注入。
- 将创作方案、分析报告、企划书、计划步骤和提示词包的详细规范放入该 Skill 的按需 references；正文只保留选择指引和共同语义。
- 建立统一但非强制铺满的内容骨架：目标、证据/输入、关键决定、交付内容、下一步；无内容的段落不得占位。
- 只有重复记录、精确映射或方案比较确实需要时才使用表格；表头由对应 reference 定义。
- AI-native 方案在需要执行时说明模型/工具角色、所需输入、调用提示、预期产物和验收方式，并以当前 DSH Tool/model catalog 为准。
- 动画化/影视化方案在确定集数、单集时长或总时长前，先证明来源覆盖度与可改编内容量；允许用有代表性的局部章节/场景抽样形成带依据、区间和置信度的暂定估算，但页数、目录、封面或任意少量页面不能直接套用固定时长公式。证据不足时先交付体量评估或覆盖审计，不伪装成完整企划。
- 参考 Kunpeng 的开源影视创作方法时，只迁移能改善创作判断的镜头叙事、视觉连续性、参考片结构迁移和视频提示词语义，并放入现有 Skill 的按需 references；不复制其私有 frontmatter、隐藏 Skill、绝对路径、供应商路由、固定九宫格或未经本仓库验证的模型参数。
- 通过真实 Evaluation 比较默认简洁、明确展开、多 Skill组合和相邻非触发请求，删除强迫过度输出的旧 case 文案。
- 在 Webview presentation 中本地化已知 builtin Skill 的显示名称、说明和调用状态，同时保留 DSH canonical name/source/provider；不向 DSH frontmatter 或 Host projection 增加私有 locale 字段。
- 将全部 OpenNeko builtin Skill 的模型可见 `description`、正文入口和按需 references 改为中文优先、英文等价的双语提示词；保持一个 canonical Skill identity，并按用户语言只读取相关详细资源，不建立中英文双 Skill 或 Host locale router。

## Capabilities

### New Capabilities

- `progressive-ai-native-content-guidance`: Agent 以渐进深度和统一内容语义生成创作方案、分析、企划、计划与提示词，并在需要时提供可执行的模型/工具 handoff。

## Impact

- `@neko/dsh-bridge`：product system prompt 只增加跨任务最小输出和展开条件，不包含文档类型字段表。
- `packages/skills/content-authoring`：拥有通用内容方法、routing description 和按需 references；不拥有 Tool权限、artifact持久化或DSH路由。
- `@neko/agent-webview`：拥有 builtin Skill 目录的本地化 presentation；未知、用户和项目 Skill 继续原样显示。
- 现有 domain Skills：仅在证据显示重叠/冲突时调整描述或输出要求，不要求一次合并或按固定数量拆分。
- `scripts/agent-eval`：新增 `skill.content-authoring`，更新 prompt composition、media-production 与多 Skill组合覆盖。
- 用户数据、artifact schema、Canvas/Cut/Generation 持久化均不改变。

## Dependencies

- 依赖 `align-dsh-skill-runtime-semantics` 的多 Skill、relative resource 和真实 source evidence。
- 不依赖 `restore-dsh-native-skill-authoring`；用户 Skill创建可后续采用同一规范。
