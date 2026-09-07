## Context

DSH 在每次模型 step 前独立组装 system sections、runtime-context sections、Tool schema、AGENTS 和 Skill。当前 OpenNeko 把产品协议与精确 Conversation context 都注册成 runtime context，因此它们以可替换的 user message snapshot 进入历史；DSH `standard` preset 的 system persona 则把所有产品会话定义为 coding agent。Character 的行为指令同时位于声明为“不可信数据”的 payload 内，个人助手配置中的自定义提示词也没有进入真实 Desktop Session assembly。

这不是单一文案缺陷，而是跨 DSH composition、Agent Session binding、Assistant Space 持久事实、Workspace 文件语义和 Chara knowledge boundary 的 authority 问题。设计必须维持 DSH 的唯一 Prompt/Skill runtime，维持 Host 对 Tool、permission、资源和 Electron trust boundary 的强制授权，并保证一个来源失效不会扩散到无关 Conversation 或 Workspace。

## Goals / Non-Goals

**Goals:**

- 为 System、Workspace、Personal Assistant 与 Character 建立唯一 owner、作用域和优先关系。
- 让模型行为 policy 与领域事实使用不同的 DSH 组合通道，并能从 secret-free facts 证明实际组合结果。
- 让用户编辑的 Assistant 与 Workspace 指令成为明确、可恢复的用户事实，但不能扩大运行时 authority。
- 保持 Conversation/CharacterVersion/Workspace 的 exact identity；变更只在明确的 turn 边界生效。
- 对无效、缺失或错配来源 fail-visible、fail-local，不选择 active/recent/default owner 作为回退。

**Non-Goals:**

- 不建立第二套 Prompt engine、Prompt registry、Prompt 版本协议或通用模板市场。
- 不把 Tool schema、permission、Host authorization、provider 选择或 Skill discovery 改成由 Prompt 决定。
- 不允许全局用户提示隐式影响所有 Workspace、Character 或 Room。
- 不改变 Character publication、Conversation transcript、Workspace authority 或 DSH Skill 的既有 ownership。
- 不为旧路径保留兼容读取、双写或自动迁移成功路径。

## Decisions

### 1. 使用四级 authority，而不是把所有文本称为 system prompt

| 层                           | Owner 与来源                                        | 精确作用域                                  | DSH 表达                        | 可编辑性                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------- | ------------------------------- | ------------------------- |
| 产品 system policy           | DSH profile + OpenNeko DSH bridge                   | 所有 OpenNeko Agent Session                 | system section                  | 不可由用户编辑            |
| owner-derived Session policy | Agent binding owner；Character policy 由 Chara 产出 | 一个 exact Conversation/participant         | system section                  | 只随权威领域选择产生      |
| scoped user instructions     | Assistant Space 指令或 DSH canonical `AGENTS.md`    | 一个 Assistant Space 或 exact Workspace cwd | subordinate instruction section | 用户可编辑                |
| runtime facts                | Workspace/Canvas/Character/Room/资源 owner          | exact Conversation 或 current turn          | runtime-context snapshot        | 通过 owning workflow 修改 |

Skill 继续由 DSH 按当前公开 contract 注入方法论；用户消息继续属于 transcript。二者都不能覆盖产品 policy、owner-derived Session policy 或运行时强制 authority。

选择 named system sections，是因为这些内容需要在模型边界拥有稳定的 instruction 语义；runtime context 只承载可能变化的事实快照。继续把 policy 写入 runtime context 会保留当前角色冲突，按领域自建多个 Prompt composer 则会制造无法证明顺序和来源的平行路径。

### 2. OpenNeko 使用一个产品化 DSH composition

Desktop 只选择一个 OpenNeko-qualified DSH composition。该 composition 保留 DSH 的通用行为、安全、工具发现、失败处理、AGENTS 和 Skill 能力，并用 OpenNeko 产品 persona 与产品协议取代 coding-agent persona。OpenNeko 不修改 staging 内的第三方文件，也不在 Provider 请求之后拼接另一段 system prompt。

产品 system policy 只包含跨领域稳定规则。具体 operation、schema、validation 和 diagnostics 仍来自 owning Tool；Workspace artifact admission、Character role mode 等只进入 exact Session policy，不膨胀全局默认 Prompt。

### 3. Session policy 由 exact Conversation binding 决定

Agent application owner 在首次 submit 前解析并冻结 Conversation 的 owner binding。每个 turn 开始前，它从该 exact binding 请求一份 bounded Session policy 和 runtime facts；整个 turn 的所有 model steps 使用同一份 policy/input snapshot。指令在 turn 运行期间发生变化时，当前 turn 不被重解释，下一 turn 才解析新值。

Assistant、Workspace、Character 和 Room participant 是互斥成功路径：

- Assistant Conversation 只接受其 exact Assistant Space 指令，不推断 active Workspace。
- Workspace/authoring Conversation 只接受 exact cwd 下由 DSH 发现的 canonical `AGENTS.md`，不读取个人助手或 Character 指令。
- Character Conversation 只接受与 frozen CharacterRun、CharacterVersion 和 mode 匹配的 Chara role policy；普通 Workspace `AGENTS.md` 和个人助手指令不自动进入。
- Room 中每个 agent-controlled participant 使用自己的 CharacterRun policy 与 visibility-filtered facts，不能看到 sibling 私有事实。

选择 binding-driven policy 而不是一个全局可变 Prompt，是因为 Conversation、后台 turn 和 UI scene 生命周期相互独立；active/current UI identity 不能成为任务 authority。

### 4. Workspace 只有 DSH canonical AGENTS authority

Workspace 不提供第二个“Workspace system prompt”字段。Host 只为 exact Workspace 授权工作目录，DSH 按公开 root/nested `AGENTS.md` 语义发现并组合环境指令。文件内容可以指导任务和输出，但不能声明新 Tool、修改 Tool schema、改变 permission、读取其他 Workspace 或取得 Host trust。

现有 OpenNeko 私有个人/项目路径不再参与成功组合。若这些位置存在用户内容，Host 保留原文件并显示可操作诊断；只有用户显式选择复制或移动到 exact canonical Workspace 位置后，DSH 才能读取它。系统不得静默删除、自动采用或继续兼容读取。

### 5. Personal Assistant instructions 属于 Assistant Space

个人助手指令是 Assistant Space 拥有的持久用户事实，而不是 Provider 配置或全局 system override。保存时绑定 exact Assistant Space identity；删除表示该 Space 回到无自定义指令的 canonical fresh state。有效更新只影响该 Space 下一 turn 的组合，不修改已有 transcript，也不重建或重绑定 Conversation。

旧的无作用域自定义提示内容不得自动获得新 authority。产品保留其原文并显示“未分配”状态，允许用户显式采用到一个 Assistant Space 或删除；未完成选择前不注入任何 Session。这避免静默数据丢失，也避免为了兼容而保留第二条成功路径。

### 6. Character role policy 与 Character facts 分离

Chara 从 exact mode、immutable CharacterVersion、knowledge boundary、behavior/expression constraints 和 participant policy 生成 bounded role policy。该 policy 可以要求以角色身份回应、限制知识与叙事视角，但其 authority 只覆盖角色表现，不能改变产品安全、Tool、permission、资源或领域写入规则。

角色 lore、背景、剧情事实、continuity、relationship、RoomView、presentation configuration 和外部证据仍作为不可信 runtime facts。任意自由文本即使包含指令语句，也不能进入更高 authority。mode 或 CharacterVersion 不匹配时只拒绝受影响的 CharacterRun/participant turn，不改用通用 Assistant、latest publication 或其他 participant。

### 7. 运行时 authority 永远位于 Prompt 之外

有效 Tool catalog、schema、permission、Workspace grant、ContentLocator、Host authorization 和 provider/model receipt 在每次调用的 owning boundary 校验。Prompt provenance 只能描述模型看见了什么，不能作为授权 token 或成功证据。用户指令、AGENTS、Character 内容和 Skill 都无法新增不存在的 Tool，或让失败调用切换到 shell、raw path、另一个 provider/source。

### 8. Composition facts 是唯一可观测接口

DSH/Host 为每次实际模型请求投影 named fragment 的 identity、authority class、source kind、exact scope identity、order 与 digest，并明确区分 system section、runtime context、AGENTS 和 Skill。事实不得包含 Prompt 正文、secret、credential、raw provider config 或绝对用户路径，也不得持久化内部 schema/version 字段。

确定性边界测试证明唯一 composer、exact binding、作用域隔离和失败局部性；真实行为验收经可见 Desktop、完整 Session owner、公开 composer 输入与真实 provider 执行。既有 `agent-runtime.prompt-composition` 评测扩展四类 authority 和负向串域覆盖；Character 角色稳定性与知识边界使用 Character target 的真实交互场景，不以 mock provider 或 direct runtime driver 代替。

## Risks / Trade-offs

- [DSH system section 与 runtime context 的缓存/历史语义不同] → 在 locked DSH contract 上做 request-level composition facts 验收，并把 policy 更新冻结在 turn 边界。
- [用户在不同入口看到的“提示词”概念过多] → UI 只暴露“个人助手指令”和 Workspace `AGENTS.md`；产品 system policy 与 Chara-derived role policy 不作为通用文本编辑器。
- [角色自由文本可能诱导越权] → 只有 typed Chara projector 能生成 role policy，自由文本保持 data；所有真实能力继续由 Tool/permission/Host 强制。
- [旧内容不自动生效会让用户感到设置丢失] → 保留原文并显示明确的未分配状态与显式采用操作，绝不静默删除或全局注入。
- [某个 scoped source 无效会阻止对应 turn] → 在最小 Space、Workspace、CharacterRun 或 participant scope 返回诊断，保持 sibling Conversation 与产品场景可用。
