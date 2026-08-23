## Context

DSH 已提供两层渐进加载：初始目录只包含名称和有界描述，Skill正文按需加载；正文又可指引模型按需读取相对资源。因此内容规范不需要全部进入 system prompt，也不需要为每种文档建立一个 runtime profile。

当前 `OPENNEKO_PRODUCT_SYSTEM_PROMPT` 要求“active artifact profile”，容易把 artifact领域契约误解为 Skill调用前置。部分 Skill/Evaluation 又要求每个工作单元输出十余字段，即使用户只要简要方案也会过度生成。

## Decisions

### 1. 系统提示词只拥有全局渐进深度

默认行为：

- 先回答结论或交付最小可用内容。
- 只包含当前决定所需的证据、约束和下一步。
- 不主动生成多个方案、完整实施清单、风险矩阵、长篇背景或持久 artifact，除非用户明确要求或任务完成必须依赖它们。
- 能安全假设时声明最小假设并继续；只有会实质改变结果的缺失信息才提阻塞问题。
- 用户要求“详细、完整、多个方案、正式文档、执行”时，扩展到相应深度。

这些规则不指定字数、段落数或 Skill数量，也不覆盖用户明确要求。

### 2. 一个可组合方法 Skill，加按需文档 guides

初始交付建立一个 `content-authoring` Skill：

```text
content-authoring/
  SKILL.md
  references/
    creative-proposal.md
    analysis-report.md
    project-proposal.md
    execution-plan.md
    prompt-package.md
    model-tool-handoff.md
```

`SKILL.md` 只描述适用边界、共同内容骨架、如何选择一个或多个 reference，以及与领域 Skill组合的原则。reference 是 DSH resource guidance，不是自动附件、artifact profile或新 router。

目录 `description` 必须让模型能从英文及中文常见意图识别该方法，但仍是 DSH 支持的单一字符串。正文要求沿用用户语言，并把“先给最小结果、再按用户选择展开”落实为交互边界；不能先生成一份完整目录再声称它是渐进式。

当新增规范只改变同一内容任务的结构/示例时，优先新增或更新 reference；当它拥有独立触发语义、独立领域判断并能与其他 Skills组合时，可以新增 Skill。是否拆分由 routing/质量/token Evaluation决定，不设固定上限。

### 3. 统一语义，不强制统一外观

所有 guide 共享五个语义槽位：

1. 目标：用户要解决什么。
2. 输入与证据：哪些是来源事实、哪些是假设。
3. 关键决定：当前采用什么及原因。
4. 交付内容：本次真正需要的方案、报告、步骤或提示词。
5. 下一步：一个可继续动作、待用户选择或真实执行入口。

槽位可以合并成段落或省略；不得为统一模板生成空章节。表格只用于三项以上重复记录、字段映射、时间/步骤序列或多个方案比较。普通结论和短计划优先使用短段落或少量列表。

### 4. 文档 guides 的最小内容

- 创作方案：创作目标、核心概念、最小交付、关键生成步骤；详细镜头/资产矩阵按需。
- 分析报告：结论、证据、影响、建议；方法、完整引用表和替代解释按需。
- 企划书：受众/目标、价值、范围、交付和关键约束；预算、排期、风险矩阵按需。
- 计划步骤：目标、当前状态、下一批可执行步骤、完成条件；不把假想工作拆成大量任务。
- 提示词包：目标模型/工具、输入角色、可直接使用的 prompt、必要参数/负向约束、验收；只在用户要求多个变体时生成变体。

每个 guide 提供最小表格规范和展开条件，但不要求每次生成表格。

### 5. AI-native handoff 以当前能力为准

当内容将交给生成模型或创作工具执行时，输出说明：

- 模型/工具在该步骤中的角色；
- 用户需要提供或绑定的输入；
- 可直接使用或继续编辑的提示词/操作意图；
- 预期产物与可验证验收；
- 当前能力 unavailable/blocked 时的最小下一步。

Skill 可以点名当前公开、稳定的模型/工具，但必须在执行前核对当前 DSH catalog/schema/permission。不可用时明确 blocked，不编造替代成功，不自动推荐大量额外工具。

### 6. 多 Skill是正常组合，不定义主 Skill

`content-authoring` 可以与 `storyboard`、`media-production`、`image` 等同时加载：前者提供输出深度与通用结构，后者提供领域判断。若指令冲突，遵循系统/用户指令层级和更具体的领域约束；不得由 OpenNeko runtime任命唯一主 Skill或吞掉其他 DSH injection。

### 7. Artifact persistence 与 Skill保持正交

普通回答保持普通 Markdown。用户明确要求长期可复用文档且 Host context允许时，现有 durable artifact marker/lifecycle继续生效。Artifact profile若由 owning domain用于机器校验，只决定产物契约，不参与 DSH Skill发现、选择或数量控制。删除 system prompt中把“active artifact profile”表述成普通结构化输出前置的歧义。

### 8. builtin Skill 国际化属于 presentation

DSH Skill frontmatter 保持仓库锁定 contract 的 canonical `name`、`description`、`whenToUse` 与 invocation policy，不增加 locale、displayName 或本地化对象。Agent Webview 可以根据 `source=bundled` 与已知 canonical name 选择本地化显示名称、摘要和调用状态，同时展示 canonical name 以支持显式 `$skill-name` 调用。用户、项目、自定义及未知 builtin Skill 一律显示 DSH 原始值，避免同名覆盖项被伪装成产品 builtin。

### 9. 适配体量先证明来源覆盖度

“动画化方案”同时包含至少两个不同阶段：来源与体量评估，以及在目标格式已成立后的创作/制作方案。普通请求不能跳过前者直接生成分季、分集或固定时长文档。

来源覆盖度至少区分：

- 文件或 manifest 报告的总单元数；
- 可确认的正文页/场景范围，以及封面、目录、空白、广告等非叙事单元；
- 已实际检查的顺序范围或样本；
- 已识别的叙事段落、动作、对白、转场与节奏证据；
- 尚未覆盖的范围及其对结论的影响。

页数只是输入规模事实，不是动画时长事实。局部抽样不是禁用项：Agent 应选择至少一个有边界的叙事单元或分层样本，记录其页数、有效正文、场景/节拍、对白、动作、氛围停留与转场，再用镜头/节拍重构形成样本时长区间。像“一个 20～30 页章节约 5～6 分钟”这样的结论只有在该作品的样本证据支持时才可作为校准点，并须同时给出样本范围、估算方法、异常章节风险与置信度；不得提升为跨作品固定公式。

全卷固定集数、单集时长或总时长必须由已覆盖的叙事段落、代表性说明和节奏假设支持，并公开最小算术检查，例如总时长、每集平均承载章节/页数/场景数和需要扩写、压缩或省略的范围。若来源只检查任意少量页、样本不具代表性或内容顺序仍未知，允许提出待验证的区间候选和下一批抽样计划，但不得选择唯一格式、编造分集标题或声称全卷内容提取完成。

此判断由创作方法 Skill 协作完成：`content-authoring` 阻止无证据的正式文档填充，`storyboard` 约束漫画/图像来源的覆盖证据，`media-production` 拥有适配体量与后续制作阶段的选择。System Prompt 不增加漫画换算公式或领域字段。

### 10. 外部创作方法只作为按需方法输入

Kunpeng `film-master`、`scene-image-anchor`、`video-style-replication`、Seedance prompt templates、`internet-ad-director`、`script-doctor` 与工具类 Skills 提供了可参考的创作经验，但其 package shape、工具名、路径、provider、模型参数和授权流程属于 Kunpeng 自身运行边界，不是 OpenNeko 或 DSH 契约。

本次采用以下映射：

- 电影镜头的叙事任务、机位理由、空间关系与剪辑接点进入 `storyboard` 的电影镜头按需 reference；
- 场景锚点、角色/道具状态、光源与空间拓扑连续性进入 `storyboard` 的视觉连续性 reference；
- 参考片的镜头切点、节奏、景别、声音和图形包装抽象为可迁移规则，进入 `storyboard` 的参考片分析 reference，并明确不复制受保护内容；
- 单片段提示词的主体、动作、空间、时间、镜头、音频、约束和参考角色进入 `video` 的模型中立 reference；当前 Tool catalog/schema 继续拥有实际 provider、model、参数、引用顺序与权限；
- “证据→根因→最小有效改动”进入 `content-authoring` 的分析报告 reference；默认不生成全维评分、固定理论命中表或完整 Coverage。

不新增隐藏 consistency Skill、prompt-template router 或 provider Skill。只有广告导演、剧本评估等方法出现独立触发、稳定质量收益与真实 Evaluation 证据后，才通过后续 OpenSpec 考虑拆分。

### 11. builtin Skill 提示词使用单 identity 双语内容

全部 OpenNeko builtin Skill 保持一个 DSH canonical `name` 和一个 package。`description` 使用中文优先、英文等价的短路由语义，因为 DSH 模型目录只常驻 `name + capped description`；只翻译正文不能改善中文隐式选择。存在 `whenToUse` 时同样提供双语语义，但不得误称其参与默认模型目录路由。

`SKILL.md` 正文先提供中文方法和语言选择规则，再保留语义等价的英文方法。短规则可以在同一正文中双语表达；较长的类型指南、示例和检查表应放入同一 Skill package 的相对 resources，并按用户语言读取对应内容。用户使用中文时优先中文，使用英文时使用英文；混合或无法判断时默认中文。最终交付只使用用户请求语言，除非用户明确要求双语结果，避免双语提示词导致双份输出。

不创建 `*-zh`/`*-en` 两套 Skill：相同 canonical name 会受 DSH scope/rank 去重，两个不同 name 又会形成重复路由与独立注入。不得增加 locale frontmatter、Host 语言 router、固定 Skill 数量或其他 DSH 外运行限制。中文与英文提示词允许自然表达而非逐句直译，但任务判断、权限边界、输出标准、blocked 语义和相对资源链接必须等价。

## Five-layer analysis

- 职责：system prompt拥有全局深度；content Skill拥有方法；domain Skill拥有领域语义；Tool/validator拥有执行和正确性。
- 依赖：内容资源只依赖 DSH resource guidance；不依赖Renderer或Host schema。
- 接口：不新增runtime接口；只新增Skill package、Webview presentation资源和Evaluation artifacts。
- 扩展：先扩reference，满足独立触发/组合条件时再增Skill；外部目录不一对一映射，无固定数量；语言扩展留在同一 Skill package，不复制 canonical identity。
- 测试：静态结构/资源检查、builtin/override本地化边界、隐式选择case和完整Desktop真实模型质量对比。

## Risks / Trade-offs

- 过度简化可能漏掉关键风险。缓解：最小结果必须包含影响当前决定的证据/约束，正式文档请求自动扩展。
- 通用 Skill与领域 Skill重叠。缓解：description清楚区分“内容结构/深度”和“领域方法”，用多 Skill组合case验证。
- reference未被读取。缓解：DSH receipt/resource-read事实和输出质量共同验收，不靠最终文本猜测。

## Migration Plan

1. 记录当前过度输出基线与代表性失败 case。
2. 更新 product system prompt和snapshot tests。
3. 新增 `content-authoring` 短正文及按需 references。
4. 删除/调整要求无条件完整字段矩阵的 Skill/Evaluation文案。
5. 运行多 Skill、默认简洁、明确展开、非触发和AI handoff真实 Evaluation。

若候选未通过 protected回归，保留基线并迭代Skill内容；不得通过限制DSH加载或隐藏其他Skills获得表面简洁。
