# ADR: AI Native 产品入口与可组合能力简化边界

- 状态：Accepted
- 日期：2026-07-25
- 范围：OpenNeko Desktop 产品入口、Agent runtime、Skill、Tool/capability contribution、Canvas、Cut、Assets/Entity、Preview、Quality 与 Export

本文补充 [`agent.md`](agent.md) 与
[`application-composition.md`](application-composition.md)。

既有 ADR 已确定普通 Agent ReAct 是唯一智能编排循环，Skill 提供方法，Tool 与领域 owner
负责确定性执行。本文进一步确定：OpenNeko 的产品和扩展面必须围绕少量高层意图与正交能力组织，
不得重新退化为 command-per-feature 的功能集合，也不得用宽而浅的 Tool/Provider 接口把组合复杂度
转移给模型。

## 背景

OpenNeko 是本地创意工作套件。用户可能提出生成、分析、改编、组织、编辑、预览、审查和交付等目标，
但这些目标经常跨越多个领域。例如“把漫画改编成短片”可能需要读取来源、提取证据、形成分镜、准备角色
参考、生成媒体、写入 Canvas 或 Cut、检查质量并导出。

传统产品容易把每种结果或步骤设计成独立命令、向导、面板和固定工作流。这样虽然能让单个功能看起来
明确，却会产生以下问题：

- 用户必须先理解产品的信息架构，再把真实目标翻译为正确功能入口。
- 来源、目标、媒体类型和处理动作形成组合爆炸。
- 相近 Tool 共享输入、输出和副作用，模型需要在多个浅接口之间猜测。
- Skill、Prompt fragment 或 capability 虽然完成注册，却可能没有进入当前 turn，形成名义能力。
- 未实现或冲突的入口可以继续出现在 UI 或被后注册项静默覆盖，表现为 apparent success。
- 领域事实被复制到工作流、Webview、Agent session 或多个 DTO，增加状态和恢复复杂度。

相反，只保留对话而删除所有直接操作 UI 也不是 AI Native。时间线拖拽、画布布局、媒体预览、参数微调、
差异审阅和诊断检查具有明确的视觉或直接操纵优势，继续由领域 UI 承担更可靠。

因此，判断 AI Native 的核心不是“是否有聊天框”或“功能数量是否少”，而是系统能否用少量稳定入口，
基于真实上下文动态组合正交能力，并把确定性事实、副作用和验证留给正确的领域 owner。

## 决策

### 1. 产品以意图为入口，不以产物类型建立功能目录

OpenNeko 的顶层 Agent 入口围绕以下交互职责组织：

| 交互职责          | 用户意图                               | 系统责任                                            |
| ----------------- | -------------------------------------- | --------------------------------------------------- |
| Invoke / Chat     | 描述目标、约束、修改意见或继续任务     | Agent 理解目标并选择 Skill 与能力                   |
| Add Context       | 指定文件、资源、项目、选择区或已有结果 | Host 解析显式 identity，领域 owner 提供可验证上下文 |
| Apply / Deliver   | 同意执行、写入项目或交付结果           | Tool policy、审批、revision 和 owning mutation 生效 |
| Inspect / Preview | 阅读、比较、预览、诊断或审查结果       | 领域 UI 或只读 capability 展示真实事实与证据        |

这些名称描述稳定职责，不要求所有宿主使用完全相同的按钮或 Tool 名。

图片、视频、语音、音乐、脚本、分镜、字幕、剪辑和导出是 Agent 可选择的领域能力或输出类型，
默认不得各自扩张为并列顶层 Agent 功能。只有满足以下任一条件时，才可以保留独立命令或直接 UI：

- 操作具有高频、确定、低歧义的直接操纵价值；
- Electron Desktop 或操作系统要求独立的文件、编辑器、导航或生命周期入口；
- 操作具有需要用户显式识别的权限、成本、安全或不可逆边界；
- 真实用户研究或 Evaluation 证明统一意图入口显著降低成功率或可发现性。

独立命令仍必须进入同一 canonical domain path，不得复制 Agent 规划、Provider 选择、项目事实或 mutation
实现。Manifest 不得声明没有生产注册和可验证执行路径的命令。

### 2. Agent 组合少量正交、深而窄的能力

领域 capability 应围绕 owning responsibility 和稳定事务边界设计，而不是把每个 UI 动作或中间步骤都
暴露为 Tool。一个能力必须能够清楚回答：

1. 它读取或修改哪一种领域事实；
2. 输入 identity、schema、revision 和权限由谁验证；
3. 与相邻能力相比，它拥有哪一个不可替代的职责；
4. 成功返回什么文件、ContentLocator、revision 或证据；
5. 失败如何返回可恢复或不可恢复的 diagnostic。

同一领域优先形成少量概念角色，例如 context、read、revisioned apply 和 preview/validate。具体领域可以
合并或省略角色，但不得同时保留多个仅在参数形状、创建来源或调用场景上略有差异的浅 Tool。

需要原子地完成多个低级 mutation 才能维持一致性时，由领域 owner 提供一个 typed transaction 或
operation batch。Agent 不逐字段拼装私有项目格式，也不把领域事务拆成依赖隐式调用顺序的 Tool 序列。

UI 导航、reveal、focus、selection decoration 和临时播放控制默认属于宿主或 Webview 交互，不因“模型
可能点击”自动成为领域 Tool。只有它们是用户目标的一部分、具备明确可验证结果且不能由已有
Inspect/Preview 边界表达时，才进入 Agent 能力面。

### 3. Skill 负责组合判断，Capability 负责机器可执行契约

Skill 说明任务判断、创作方法、跳过和重排条件、质量标准及交付语义。Skill 可以指导 Agent 组合多个
领域能力，但不得固化来源到产物的单一路径，也不得包含具体工具协议。

Capability contribution 提供当前可执行的 Tool schema、diagnostic、资源绑定和领域事实投影。它不得
复制 Skill 的方法论，也不得维护平行能力目录、固定 Workflow、领域专用 Agent core 分支或隐藏状态机。

文件类型、入口位置或上一次执行结果只能贡献证据和上下文，不能在 Agent 规划前把开放意图硬编码为
某一种产物，例如把所有文本或文档输入自动解释为视频生成。

### 4. 注册能力必须真实进入当前运行路径

Tool、Skill、Prompt fragment、AGENTS/environment overlay、reference contributor 或其他 capability
只有同时满足以下条件，才视为可用：

- 由当前 composition root 发现和注册；
- 投影到当前 session/turn 的正确层；
- 在执行前完成 schema、owner、权限和 availability 校验；
- 可通过运行时证据证明目标 contribution 被消费；
- 缺失、冲突、陈旧或版本不匹配时 fail-visible。

仅有类型、Provider、getter、注册表条目或单元测试，不代表能力已经接入产品。Desktop composition
必须证明最终 Prompt、Tool 集合和上下文投影包含预期贡献。

同名 Tool、Skill、Prompt fragment 或 capability identity 默认是契约冲突。Registry 必须拒绝冲突并
返回 owner-aware diagnostic；不得通过注册顺序、最后写入覆盖或静默 first-writer-wins 决定运行行为。
确需替换时，必须通过显式、可审计的 replacement 契约完成。

### 5. 扩展点必须对应真实变化点

公共 Provider 或 registry 不得为了未知未来需求预置大量可选方法。新增扩展点前必须至少明确：

- owning responsibility 和消费方；
- 至少一个真实生产贡献者和一个真实生产消费者；
- 生命周期、identity、冲突和错误契约；
- 相比直接模块组合能够移除的实际耦合；
- 聚焦测试和真实运行路径如何证明它被消费。

只有一个稳定实现且没有替换需求时，优先直接模块组合。多个贡献类型的生命周期、冲突规则或消费方不同
时，应使用小型专用 contract；不得用一个全可选 Provider 同时充当 Tool、Prompt、Artifact、Provider
metadata、Reference 和 UI projection 的通用容器。

删除或合并扩展点时必须同步清理生产注册、public export、测试 fixture 和文档，不保留空命名空间、
平行 PromptManager、旧 workflow 注释或 compatibility adapter 维持多种事实来源。

### 6. 领域 UI 保留直接操纵优势，但不拥有持久事实

AI Native 不要求所有操作经由自然语言。以下交互默认继续由领域 UI 提供：

- Canvas 空间组织、选择、拖拽、对齐和关系检查；
- Cut 时间线定位、trim、split、播放和基础参数微调；
- 媒体、3D、文档和差异的只读预览；
- 审批、成本、诊断、任务进度和质量证据检查。

领域 UI 只投影或编辑 owner 提供的 canonical state。Webview 不拥有可写项目快照、Agent 编排状态、
Provider 生命周期或后台任务事实。Agent 与 UI 必须通过同一个 typed domain command、revision 和结果
契约修改事实，不能各自维护一套实现。

### 7. 简化以概念和决策负担衡量，不以 LOC 单独判断

LOC 用于定位复杂度集中区，不能单独证明功能简单或 AI Native。每次相关审计至少检查：

- 用户完成一个目标前需要理解的顶层入口数量；
- Agent 对同一意图可见的相近 Tool 数量；
- 同一领域事实的 owner 和序列化来源数量；
- Prompt、Skill、Capability 从注册到当前 turn 的完整路径；
- 一个能力从输入、执行、异步任务到结果交付的中间状态数量；
- 未实现入口、无消费者扩展点、重复 manager/registry 和固定领域分支；
- 真实 Evaluation 中的能力选择、旧路径未命中和最终领域副作用。

只有删除 LOC 但保留重叠概念、平行入口和隐式选择，不视为简化。为了形成深而窄的 canonical
capability，增加少量 typed contract、revision validation 或路径测试是可接受的。

## 架构不变量

- Agent session/turn 是唯一智能选择循环；不得增加固定创作 Workflow 或第二套领域编排器。
- 顶层 Agent 功能不得按“媒体类型 × 操作”持续扩张。
- 一个持久事实只有一个领域 owner 和一个 canonical mutation path。
- Tool 与 capability 必须正交、owner-aware、schema-first，并返回明确结果或 diagnostic。
- 已注册 contribution 必须进入真实 session/turn；不可执行能力不得以可用状态展示。
- identity 冲突、未知 schema、缺失 consumer 或未注册实现必须 fail-visible。
- Skill 不承担工具协议，Agent core 不承担领域方法，Webview 不承担持久事实。
- 直接操纵 UI 与 Agent 使用同一领域契约，不维护平行成功路径。

## 后果

正向后果：

- 用户可以从目标出发，不必先选择正确的媒体功能或固定工作流。
- Agent 面对更少、更正交的能力，Tool 选择和恢复路径更容易验证。
- 新 Provider、Skill 或领域包主要增加可组合能力，而不是扩张顶层产品菜单。
- Canvas、Cut 和其他领域可以保持适合人工操作的 UI，同时复用同一事实和 mutation 边界。
- Prompt 与 capability 注入从“存在代码”提升为必须具备运行时证据的产品契约。

代价与风险：

- 统一入口会降低部分功能的显式可发现性，需要通过上下文操作、命令面板描述和领域 UI 弥补。
- 合并 Tool 前必须确认事务、权限和错误语义一致，不能仅因名称相似强行抽象。
- 过大的通用 `apply` 容易变成无边界万能接口，必须由领域 schema、operation union、revision 和 policy
  约束。
- Prompt 和 Tool 的实际投影需要在 Desktop runtime 与测试 harness 之间保持一致，composition root
  的验证成本会上升。
- 当前实现与本 ADR 仍有差距；后续删除命令、收敛 Tool、修改 Provider 契约或接通 Prompt composition
  属于非平凡变更，必须通过独立 OpenSpec 定义范围、迁移和路径级验收。

## 验证要求

涉及本 ADR 的实现变更除受影响包测试外，必须提供以下证据：

1. Manifest、命令和运行时注册一致；不存在仅展示但不可执行的功能。
2. 目标意图命中统一 Agent/domain canonical path，旧 command、workflow 或 adapter 被删除、poison 或
   显式隔离。
3. 最终 session/turn snapshot 包含预期 Skill、Prompt fragment、environment overlay、Tool 和上下文。
4. 重复 identity 注册直接失败，并包含 contribution owner diagnostic。
5. Tool 路径测试断言正确 owner、revision、handler/adapter 和最终副作用被命中。
6. 按 `.codex/skills/neko-agent-evaluation/SKILL.md` 运行聚焦真实 Agent Evaluation，观察能力选择、
   跳过/重排、失败恢复和交付证据；key-free harness 只能证明评测基础设施，不替代真实行为验收。
7. 涉及 Renderer/Webview 交互时，在隔离 fixture workspace 中完成真实 Electron Desktop 验证。
