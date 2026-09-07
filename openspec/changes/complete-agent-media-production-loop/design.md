## Context

当前创作路径已经拥有 Markdown 创作文档、Canvas Generation 候选、持久 Generation Job、Canvas 到 Cut 的用户操作和 Cut 导出，但这些能力尚未形成可由 Agent 逐步推进、由创作者直接评审的连续路径。尤其缺少视频内容证据、镜头行与采用素材的稳定关系，以及 Agent 可调用的时间线组装与交付检查。

该能力跨越 Content、Generation、Canvas、Cut、Agent Runtime 与 Desktop Host，必须沿用各领域现有 authority，不能建立统一 production session、审批对象或工作流数据库。

## Goals / Non-Goals

**Goals:**

- 用一份 Markdown 场景/镜头表保持整体创作路线和当前镜头结果。
- 让创作者明确选择的 Generation 输出成为后续步骤可复用的稳定引用。
- 让 Agent 在同一任务中执行当前依赖波次的全部独立媒体操作，等待并检查整批真实结果，再按结果继续无歧义的下一波次。
- 让 Agent 以有界抽帧证据观察视频候选，并给出可验证的选片或修复建议。
- 让 Agent 通过 Cut owner 完成最小时间线组装，并获得可观察的导出、QC 与交付结果。

**Non-Goals:**

- 不建立跨领域状态机、独立审核关卡、批准记录、预算模型或自动通过机制。
- 不建立批量 Generation API，不把多个素材合成一个 provider 请求，也不改变单个图像、视频或声音 Skill 的有界操作语义。
- 不把 Scene、Shot、候选或交付清单提升为新的全局 durable 实体。
- 不增加第二媒体分析模型，也不让 Agent、Canvas 或 Desktop 直接修改 OTIO。
- 不在首轮能力中提供自动剪辑、复杂特效、完整调色或主观质量自动裁决。

## Decisions

### Markdown 保存创作路线，领域对象保存生产事实

场景和镜头继续使用可编辑 Markdown 表格及 `SCxx`、`SHxx` 本地行标识。镜头行只在创作者明确采用候选后写入稳定 Workspace 媒体引用；Generation Job、候选、Canvas 节点、Cut timeline 与导出 Job 仍由各自 owner 保存。相比新增统一生产项目模型，这一方案允许用户直接修改内容，也避免重复 authority。

### 当前预览不等于采用结果

Canvas 可以显示或高亮一个候选，但该 presentation 选择不能自动写入 Markdown、Cut 或交付。创作者明确表达“使用这个”后，Agent 才通过现有 authoring 路径更新对应镜头行并推荐下一操作。相比新增审批对象，这一语义直接利用用户操作和创作文档作为事实边界。

### Agent 输入素材保存在 Generation 节点中

Agent 投影 Generation Job 时，将精确媒体输入 locator 保存在该 Generation 节点内，供参考预览和重跑共同使用；不能为了展示输入而在 Canvas 上再创建普通素材节点。若 locator 已由既有 Generation 节点的当前输出提供，则新节点直接以 `derived-from` 连接该 Generation 节点；若用户原本已在 Canvas 放置普通素材节点，可以继续使用显式 `reference` 关系。这样既避免重复索引，也保持“基于上一生成结果调整”的真实 lineage。

### 视频检查是 Content 提供表示、当前 Agent 模型完成判断

Content 使用既有 Node/FFmpeg 媒体能力探测一个精确 Workspace 视频，并生成低成本总览联系表或指定短时间段的有界帧条。结果作为 DSH Tool 的瞬态图像证据返回；Agent 根据镜头合同判断内容、连续性和缺陷。相比引入专用视频分析模型，该方案保持单一模型 authority，并能控制上下文和运行时间。

### Cut 保持唯一时间线、导出与技术 QC owner

Agent 只提交精确 Cut 文档、稳定媒体引用和有限 authoring 意图。Cut 负责探测、插入、移动、基础转场、时间线 validation、FFmpeg 导出和实测 QC。Canvas 与 Agent 不直接构造或修改 OTIO。导出结果返回结构化 QC 和交付清单；只有用户明确要求时才另行发布清单文件。

### 每轮推进一个依赖就绪批次，而不是一个素材

Agent 先读取当前 Markdown、Canvas、Generation 与 Cut 事实，从当前阶段计算所有输入已绑定、Tool schema 已确认且彼此没有结果依赖的操作。每个素材仍由对应领域 Skill 编译成一次有界 Tool 调用；Agent 在同一任务中发出该批次的全部独立调用，等待所有调用结算，并逐项检查真实结果。一个图片结果返回不会终止仍有 sibling 的批次，也不会把多个图片合并成一个 provider 请求。

批次结算后，Agent 从真实结果重新计算依赖：无歧义且不需要新权限的修复或下一依赖波次可以在同一任务中继续；需要创作者采用候选、改变创意、确认权限或成本，或不存在唯一修复时才停下并请求一个决定。Generation Job 继续逐调用持久化，Markdown 继续承载可编辑的生产输入与依赖，既不增加批量 Job contract，也不建立全局工作流状态。

## Risks / Trade-offs

- **Markdown 行被用户重写后引用可能失效** → 更新前按精确文档内容和唯一 `SHxx` 行校验；缺失或重复时只阻塞该次写入。
- **抽帧无法证明完整运动质量** → 总览只用于筛选；疑似闪烁、跳变或漂移时读取短时间段帧条，并把未观察区间标为未验证。
- **基础 Cut authoring 不能覆盖专业后期** → 首轮只支持构成可评审成片所需的导入、排列和基础转场；复杂处理继续由明确的后期能力承担。
- **跨领域调用可能产生部分完成** → 每个 owner 先提交自己的 durable 结果再返回稳定引用；后续写入失败不回滚已完成的独立 Job，并显示精确阻塞位置。
- **节点内输入与显式连接可能指向同一内容** → 按 ContentLocator identity 去重，显式既有节点负责关系展示，Generation 节点内 locator 保持重跑事实但不产生重复输入。
- **同批操作可能部分失败或不同步完成** → 以每次 Tool call 的终态为事实，保留成功 sibling，只阻塞依赖失败项的后续波次；Agent 不用第一个成功结果代表整批完成。
