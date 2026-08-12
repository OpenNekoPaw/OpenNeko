# Chara 领域架构

## 当前状态与收敛方向

`@neko/chara` 是 CharacterProject/Version、CharacterStoryline authoring、Companion continuity、Dialogue/Room、CharacterRun、UserCharacterRelationship 和角色语义的 host-neutral owner。当前 foundation 中的 `CharacterStorylineRun`、运行时 transition/revision、run-scoped `CharacterMemoryScope`、Narrative external Composition requirement 和固定 Avatar Runtime Manager 是待删除的原型路径，不构成目标架构。

目标调用链是：Chara 产出精确角色/模式/上下文投影，Agent application/session owner 执行 Conversation/turn，Host 组合 owner-qualified Scene surfaces，Desktop 只完成 Electron trust-boundary wiring。

## 五层分析

| 层   | 结论                                                                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Chara 拥有角色与故事线创作事实、Companion continuity、Dialogue/Room policy 和角色上下文；Agent 拥有消息、turn、provider 和任务；外部资料/表现由来源 owner 拥有；Desktop 只拥有 Electron 边界。             |
| 依赖 | Chara core/application 只依赖 package contracts 和注入 port；不导入 Electron、React、Agent runtime implementation、World/Game 私有实现或本地资源路径。                                                     |
| 接口 | 使用一个严格 Conversation mode union、精确 Storyline/Version/Node ref、稳定 continuity identity、owner-qualified context/presentation ref；无 optional bag、active identity 或 internal contract version。 |
| 扩展 | 新 Storyline 内容扩展 node authoring context；新资料/表现类型由真实 owning provider 扩展 public union/registry；不得在 Chara 或 Desktop 添加 wildcard/default adapter。                                    |
| 测试 | producer codec、application service、Node repository、Agent consumer、Host/Webview、Desktop delegation 和真实 Electron/Agent Evaluation 分层验证，旧路径必须 poison/fail-closed。                          |

## Owner 与事实模型

```text
CharacterProject
  -> CharacterDefinition
       -> BackgroundStory / OriginSetting
       -> canon / knowledge / behavior / expression
       -> representation / voice refs
  -> immutable CharacterVersion

CharacterProject
  -> CharacterStoryline
       -> CharacterStorylineDraft
       -> immutable CharacterStorylineVersion
            -> immutable StorylineNode snapshots

userId + CharacterProjectId
  -> CompanionContinuity
       -> CharacterMemory entries/candidates
       -> UserCharacterRelationship entries/candidates

CharacterConversationSelection
  -> companion | narrative
  -> CharacterRun / CharacterRoom / RoomRun
  -> primary AgentSession per agent-controlled participant
```

| 数据                                                                 | 唯一 owner                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| Character draft、Background/Origin、canon、知识和行为策略            | CharacterProject                                        |
| 用户管理的 immutable Character publication                           | CharacterVersion                                        |
| Storyline identity、draft、publication、node authoring context       | CharacterStoryline owner under CharacterProject         |
| 日常角色主观记忆                                                     | CompanionContinuity / CharacterMemory service           |
| 日常用户—角色关系记忆                                                | CompanionContinuity / UserCharacterRelationship service |
| Character/Room identity、participant policy、RoomEvent               | CharacterRun / CharacterRoom / RoomRun                  |
| Conversation、turn、transcript、compaction、provider/model execution | Agent application/session owner                         |
| 外部资料 bytes、授权和 locator                                       | Workspace / Content / Assets / Host owner               |
| 图片、模型、音频、Web/Game/Scene facts 与昂贵 runtime                | 对应 Presentation/Media/Game owner                      |
| Window Scene、slot 和 presentation geometry                          | Host / Desktop Window presentation                      |

UI selection、Timeline、context cache、transcript summary、模型输出和 active/recent identity 都不是领域事实 owner。

## Conversation mode contract

Chara 使用一个严格判别联合，而不是 `runtimeKind` 加 optional 字段：

```ts
type CharacterConversationSelection =
  | {
      readonly mode: 'companion';
      readonly characters: readonly CompanionCharacterSelection[];
    }
  | {
      readonly mode: 'narrative';
      readonly characters: readonly NarrativeCharacterSelection[];
    };
```

Companion participant 只携带精确 CharacterVersion 和 Chara 解析的 continuity identity。Narrative participant 携带精确 CharacterVersion 和可选的精确 Storyline/Version/Node ref。任一模式出现另一模式字段必须 decode/validation 失败；不得通过空字段、default 或 provider failure 改变模式。

模式与所有 participant 选择在首次 submit 前冻结。改变模式或节点只能建立新的 launch draft 和 Conversation，不能重解释旧 transcript。

一个 participant 创建 Dialogue，多个 participant 创建 Room。每个 agent-controlled participant 都有独立 primary AgentSession、provider/model/TTS receipt、上下文和 RoomView；human-controlled participant 不创建隐藏 AgentSession。

## CharacterStoryline authoring

CharacterStoryline 是一条稳定个人故事弧的 identity。它拥有唯一可变 draft 和零到多个用户管理的不可变 publication。一个 publication 固定精确 CharacterVersion、premise、constraints、图/顺序关系和全部 node snapshots。

StorylineNode authoring context 可包含：

- situation、time、location；
- Character/relationship state；
- allowed/forbidden story facts；
- authored narrative memories；
- knowledge boundary；
- behavior/expression constraints；
- author-only note 与 spoiler visibility。

Runtime 不拥有 Storyline 状态。Narrative 只物化用户确认的 exact publication/node，禁止创建 `CharacterStorylineRun`、observation candidate、accepted transition、progress revision、Save 或 branch。对话中出现“完成节点”的文本没有领域效果；需要修改故事线时只能生成带来源 authoring candidate，由作者显式编辑 draft 并重新发布。

用户 Timeline 与 Character turn context 是两个投影：Timeline 可按 spoiler policy 展示结构；Character context 只包含当前情境、允许的前置背景、叙事记忆和知识/行为边界。未来事实、forbidden facts 和 author-only notes 不得进入模型上下文。

## Companion continuity

CompanionContinuity 在 `userId + CharacterProjectId` 下稳定存在，与任一 CharacterRun、Conversation、AgentSession 或 CharacterVersion 解耦。Character subjective memory 与 relationship memory 是两个独立集合和 review policy。

已接受 entry 必须保存精确来源 CharacterVersion 以及 Conversation/Turn 或 RoomEvent ref。发布新 CharacterVersion 不改写历史 entry；canonical projector 根据新 publication 的知识/行为边界决定当前 turn 是否可用。不兼容或非法 entry 保留原内容并携带局部 diagnostic。

Transcript、RoomEvent、native Assistant output 和外部资料都只是证据。只有显式 candidate/review operation 能接受、纠正、拒绝或删除记忆；Character 和 relationship 两个 owner 的操作互不决定。

Narrative 在 validation/materialization 边界拒绝 continuity read/write/candidate。其 relationship state 和 narrative memories 只能来自精确 CharacterVersion/StorylineNode。

## Agent context 与 transcript

AgentSession 是完整消息的唯一 owner。Chara context materializer 按模式生成有界、participant-specific projection：

```text
Companion:
  exact CharacterVersion
  -> compatible accepted CharacterMemory
  -> compatible UserCharacterRelationship
  -> visibility-filtered RoomView
  -> optional current-turn authorized external context

Narrative:
  exact CharacterVersion
  -> optional exact StorylineVersion/Node character projection
  -> visibility-filtered RoomView
```

Narrative started turn 保存紧凑 receipt：ConversationId、TurnId、CharacterVersionId 和可选 StorylineId/StorylineVersionId/StorylineNodeId。receipt 不复制消息或 node content，不表达 progress。Agent compaction 不能删除 Chara authoring facts；重开时从 exact immutable source rematerialize。source 缺失时只让受影响 Conversation fail-visible，禁止解析 newer/latest publication。

Companion native-model lane 使用单独 Assistant-owned Conversation/AgentSession。它拥有明确 Assistant identity、provider/model receipt、transcript、取消和失败生命周期；不得在 Character AgentSession 内切换 System Prompt，也不得提交 Character/Room response。

## 外部资料与 Presentation

Companion draft 可携带可移除的 exact owner-qualified source refs。提交时 Agent 通过既有 context provider 在来源 authority 下物化有界内容；raw path、bytes、Webview URI 和授权 token 不进入 Chara/Renderer durable contract。资料只服务当前 turn，自动持久化、后台检索或 UI mount 不能扩大后续上下文。

Narrative parser、UI 和 application service 都拒绝 external-material refs；这是 mode contract failure，不是 unavailable-provider fallback。

Character representation 只保存语义和稳定 ref。Presentation provider 将它解析为 exact authorized Surface ref；Host registry 精确映射唯一 handler，duplicate/unknown/mismatched ref 局部失败。Chara 不拥有 Web content、World state、Gameplay rules、engine runtime 或外部资源 bytes。

## Workspace 目录与可移植角色包

角色管理、创作和运行的唯一持久 authority 是 Host 授权 Workspace 下的 Chara 目录记录：

```text
neko/characters/<characterProjectId>/
  project.json
  lineage.json
  versions/...
  storylines/...
  authoring-tests/...
  localized-assets.json # exact opaque ref/representation 到入口文件与所属文件的绑定
  assets/... # 仅用户显式本地化的角色自有副本
```

`assets/` 中存在文件并不表示该素材可用。只有 `localized-assets.json` 中 exact `resourceRef + representationId + kind` 与入口相对路径、所属文件 inventory 完整匹配时，本地副本才是该 opaque ref 的 canonical realization；不得从目录名、文件存在或已释放的 ZIP manifest 推断或回退。

`.neko-character` ZIP 只服务用户显式触发的导入和导出，不是 Character identity、live repository、Workspace、runtime 或同步源：

```text
export: canonical Workspace records -> bounded ZIP snapshot
import: ZIP validation/preview -> explicit Workspace install -> release ZIP resources
```

导入时先写入角色自有 bytes，再提交 canonical localized-asset binding；若中途失败，未绑定 bytes 不得被报告为可用，精确重试可以继续安装。导入完成后，管理、Studio、Dialogue 和 Room 只读取已安装的 Workspace records；移动、修改或删除源 ZIP 不影响已安装角色。产品不得保存 ZIP 路径、manifest 或打开状态作为角色事实，不得挂载、监听、回读、同步或从 ZIP 原地编辑/运行。导出包不包含 Conversation、Room、Companion continuity/memory、Narrative run、provider/model 配置、Skill/Tool grant、approval、credential、cache 或 presentation snapshot。

普通 representation/voice 继续保存 opaque ref。只有用户明确选择、Host 授权且允许复制的素材 bytes 才可进入角色包；未内嵌资源作为 external dependency 显示，不静默复制全局库、项目 sibling 或任意本地路径。

## 分层与依赖

```text
@neko/chara contracts/core
  -> shared stable refs / domain values

@neko/chara application
  -> chara core
  -> package-local Agent / Context / Asset / Voice / Presentation ports

@neko/chara-node
  -> public Chara directory repository ports
  -> bounded import/export ZIP byte adapter only

@neko/chara-webview
  -> public Chara contracts and projections

@neko/host
  -> version-free Scene / slot contract

apps/neko-desktop
  -> sender-bound IPC / Window / resource authorization adapters
  -> public Chara / Agent / Host / Presentation ports only
```

Desktop 不得选择 mode、continuity compatibility、Storyline node、memory eligibility、Narrative fact visibility、participant scheduling 或 Presentation fallback。Renderer/Webview 不得读取工作区文件或访问 Electron/Node API。

## Workbench 与生命周期

Character Interaction Scene 只有以下有界 slots：

- Interaction：Agent Interaction 或 Room；
- Main：一个 exact Character Presentation Surface；
- Manager：Companion/Narrative Context 或 Room Participant Manager；
- Timeline：可选 Storyline Timeline 和/或 RoomEvent Timeline；
- Status：slot-local diagnostics。

所有 Surface ref 必须绑定同一 exact Conversation owner。Window layout 只保存 geometry/visibility，不保存 mode、Storyline、memory、participant 或 provider facts。Storyline Timeline 是 authoring structure，RoomEvent Timeline 是 runtime event order；两者不能互相推断 progress。

离开场景时 React Roots 卸载，无保护 Presentation/Web/Game resource 释放。运行、排队、审批或未完成外部操作由 exact runtime owner 保护，不得因此保留 hidden Root。重开从 exact identities 和最小 presentation snapshot 重建。

## 持久化、旧记录和错误隔离

Chara Node 分别持久化 Character/Storyline authoring、Companion continuity、Dialogue/Room 和 mode receipts。repository 逐条 strict decode；一条非法 record 不阻止 sibling 或 workspace startup。

旧 `CharacterStorylineRun`、observation/transition 和 run-scoped memory bytes 必须保留为 owner-qualified invalid/obsolete records，但不得进入新 reader 的成功集合。用户通过显式 offline inspect/export/cleanup 操作处理；不得自动转成 Storyline publication、continuity memory 或空默认值。

以下情况必须 fail-visible、fail-local：

- mode fields 混用或尝试原地切换；
- exact CharacterVersion/StorylineVersion/Node 不存在或不匹配；
- Narrative 请求 native lane、external material 或 Companion continuity；
- missing native provider/model；
- unknown/mismatched Presentation surface；
- malformed continuity/memory/receipt record。

Pre-commit launch failure 不得留下 partial CharacterRun、Room、AgentSession 或 first message。Post-commit provider failure 保留已创建的 Conversation owner 并记录 failed turn。所有失败都不得选择 active/recent/latest identity、另一 provider/source/renderer、旧 contract 或空成功值。

## Product promotion 与验证

Character production entry 仍受独立 promotion gate 保护。package implementation、deterministic fixture、test route 或保存的 experimental Scene 不得使生产入口成功。

验证必须覆盖：

- strict producer/consumer codecs 与旧 shape poison；
- Storyline publication immutability 和 node context filtering；
- Companion cross-Conversation continuity 与 Narrative isolation；
- independent AgentSession/model/TTS/RoomView；
- Host/Webview owner matching、slot-local failure 和 UI lifetime；
- Desktop delegation/trust boundary；
- key-free Evaluation authoring、provider-backed complete Desktop session 和 visible Electron flow；
- promotion gate 继续 fail-visible。
