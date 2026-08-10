## Context

`@neko/world` 与 `@neko/world-node` 已提供 `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch`、WorldEvent、WorldState 和 participant-scoped WorldView 的 Foundation；完整 WorldExperience 的 Desktop producer/consumer path 仍保持 unavailable。前置变更 `define-character-dialogue-chatroom-world-foundation` 建立了这条最小真实闭包，本设计必须原地扩展它，不能建立第二套世界事实链。

当前代码还组合了可写 World Foundation Desktop scene，但路线图没有记录 Interactive World 的晋级证据。工程原型不能反向改变产品门禁，因此本 change 只保留已完成的 Foundation/transformation 实验闭包，并负责关闭生产入口与拆分后续设计；它不再作为完整 World 产品的长期总 change。

本设计把 Neko World 定位为 AI-native、内容驱动的互动世界能力族，而不是一个万能 domain：Content-to-Experience authoring 把用户意图以及剧本、角色、场景、素材和玩法说明编译为 owner-qualified 候选；World Definition/Runtime 提供共同事实、规则与状态，World Story 提供世界级冲突与发展，World Gameplay 提供可选玩法，World Experience 负责创作组合、发布和运行绑定，World Presentation 负责文本、Web、游戏引擎、世界模型或其他界面的可见执行。Character 与 Character Story 由 Chara 独立拥有；Agent Play 负责理解、规划与经授权控制。消费期 AI、Web、Game Engine、World Model 和自定义代码都是作品按能力选择的执行/表现依赖，不是所有 World 的共同前提。

真实运行边界包括 World host-neutral domain/application、Chara、Entity、Content/Assets、唯一 Pi/AgentSession、Desktop Main/preload/renderer、Node 项目文件 adapter 和未来可选的生成式表现 provider。当前没有需要兼容的 World 用户数据或旧生产 route。

### 当前实施边界

当前实施只把已经存在的 Foundation 收敛为一条可见、可测试的产品路径：

```text
World Foundation Studio
  -> WorldProject -> immutable WorldVersion
  -> deterministic preview WorldRun -> WorldSave / branch
  -> exact WorldActionIntent -> WorldEvent -> WorldState
  -> catalog / event / state inspection and committed replay
```

Foundation Webview 通过一个 package-owned host contract 获取 snapshot 并执行精确命令；`@neko/world` application service 拥有命令解释和事务编排，`@neko/world-node` 继续拥有 SQLite adapter，Desktop 只做 sender-bound IPC 和 scene composition。预览只注册最小、确定性的 Foundation 事实动作，用于作者检查初始定义和事件链；它不调用模型、不创建 Story/Gameplay/Experience 记录，也不进入完整 World Experience 的成功路径。

因此该切片可以在无 AI provider 时创建、检查、分支和回放 Foundation 记录，但由于尚无 Experience composition、Interaction Surface、内容编译与持续改造 producer，仍不能“进入世界”。完整 World Experience 的 unavailable diagnostic 不得被本切片删除或替换。

这些能力只在 package/隔离 fixture 中成立。路线图晋级前，生产 Host 对 World Management intent 返回 owner-qualified unavailable，不挂载 World Root；旧 `world-management` presentation 在 Window claim 时重置为 fresh Agent Entry 并产生可观测 diagnostic。该操作不读取、迁移、删除或改写 WorldProject、WorldVersion、WorldRun、WorldSave、branch 或后台 task/runtime。

### 后续变更边界

| Change                                           | 单一责任                                                                                                 | 明确不拥有                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `define-world-topology-and-data-contracts`       | World/Story/Experience 的 package topology、canonical contracts、codec 与引用边界                        | runtime、Desktop surface、Agent/实时执行                  |
| `build-deterministic-world-experience-runtime`   | headless authoring、publication、event/state、Save/branch/replay 与 deterministic Experience composition | Renderer、Agent/AI、Gameplay                              |
| `add-world-interaction-surface-and-desktop-loop` | package-owned Webview、Desktop Library/Studio/Runtime composition 与真实用户循环                         | 业务事实、provider 选择、Gameplay 规则                    |
| `qualify-world-agent-and-realtime-capabilities`  | Agent role composition、capability resolution、实时资格、取消与安全评估                                  | World/Story facts、Desktop navigation、Gameplay authority |
| `add-world-gameplay-and-agent-play-composition`  | World Gameplay aggregate/session 与 Agent Play consumer boundary                                         | World facts、外部 Game facts、通用 Agent loop             |

这些 change 均处于未实施状态；只有独立晋级 change 能基于真实用户证据决定何时原子开放生产入口。

### 五层分析

| 层   | 结论                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | World 是能力族；Definition/Runtime、World Story、World Gameplay、Experience 与 Presentation 各自拥有稳定职责和聚合。Chara 拥有 Character 与 Character Story；Agent 拥有 Play 和模型会话；创作工具拥有各自产物。                       |
| 依赖 | World core 只依赖稳定 ref/domain value；application 通过窄 Chara、Agent、Content/Asset、AI capability 与 repository port 组合，不导入 Electron、React、Node 或具体模型 SDK。                                                          |
| 接口 | public contract 分 authoring、publication、runtime、persistence 和 projection；Experience 只保存精确 ref、映射和 policy，运行绑定只协调独立 Run/Session；跨 owner 变化通过 typed intent、committed event 与 progress candidate 协作。 |
| 扩展 | 新 Story 类型、Gameplay、AI role、Web/Engine/World Model profile 或 provider 通过精确 schema/policy/adapter 扩展；不通过作品名、Renderer 类型或 Provider 名称建立平行事实路径。                                                       |
| 测试 | domain fixture 验证独立 lifecycle、发布组合、状态转换、故事进度、玩法验证、知识过滤、分支/回放和 AI 越界拒绝；Node fixture 验证项目文件；Desktop/Webview 接入后使用隔离工作区和真实 Electron。                                        |

## Goals / Non-Goals

**Goals:**

- 建立 World 顶层能力族与内部独立 aggregate/runtime owner，避免“都是 World 能力”被实现为“都由一个 World service 管理”。
- 建立 World Story 与 Character Story 的独立创作、发布和运行生命周期，以及创作期组合和运行期参与绑定。
- 允许同一 CharacterVersion 在不同 World Story 中创建相互隔离的 CharacterStorylineRun，并只通过显式 journey/transition 延续跨世界经历。
- 建立 World Gameplay 与 Agent Play 的边界：前者拥有规则、席位、状态和结果，后者拥有理解、规划、proposal 与控制。
- 使创作者能够从创作意图和内容/IP形成来源可追踪的 World、Scene、Story/Quest、Character binding、Gameplay/Interaction 与 Presentation 候选，经能力解析、语义 diff 和作者接受后发布 WorldVersion 与可安装 WorldExperienceVersion。
- 允许用户以明确 stance 进入世界，通过自然语言和声明式 affordance 与角色、场景和故事互动。
- 允许每个 WorldExperienceVersion 按能力声明 required/optional 的 deterministic、Agent/AI、interaction、execution 和 presentation requirements，并只在全部 required capabilities 可用且至少一个 Interaction Surface 可用时创建 Run。
- 允许用户在运行中继续提出世界改造意图，将其分类为 state、structure、Story/Quest、Gameplay/Interaction 或 Presentation 变化，显示精确 diff/capability gap，经对应 owner 校验后提交事件、创建分支或显式提升为新版本。
- 使用单一 canonical Intent/Event/State/View contract 和有真实 CAS 消费者的 state revision 保证并发、知识、权限、存档、分支和回放正确性，不建立内部 contract generation 或版本分发。
- 允许 AI-native 动态角色、导演、规则推演和多模态表现以实时流参与消费，同时保证模型输出不能越权提交事实或越过延迟边界迟到写入当前世界。
- 以流式文字、2D角色/场景组合、流式语音作为首个实时表现，并为未来通过资格的 image/video/spatial provider 保留窄边界。
- 保持 Desktop 为薄组合根，保持 World project facts 与本机 SQLite projection 分离。

**Non-Goals:**

- 不在 World core 中实现游戏引擎、ECS、物理、碰撞、导航、帧循环、键鼠/手柄控制或多人网络同步；需要时只通过显式 Engine adapter/profile 组合。
- 不实现外部游戏代打、VLA、seat control lease、Computer Use 或任意桌面控制。
- 不允许游戏引擎、生成式视频或 3D World Model 承担 World、Story、Gameplay 或 Character 的语义事实、存档和运行正确性。
- 不把普通线性媒体、单次生成 Job 或只有预渲染跳转而没有语义 Run/State/Event 的作品伪装成 World；确定性或没有消费期 AI 的互动作品只要拥有真实 World/Experience authority 和 Interaction Surface，仍可成为 World。
- 不允许图片、视频或其他耗时生成任务在 World Run 的关键路径中延迟完成后再替换当前世界；此类产出必须在传统 authoring/Generation 流程中完成并以发布素材进入 World。
- 不把 World 简化为线性视觉小说、聊天 transcript、Canvas Storyline、知识图谱浏览器或单次内容生成任务，也不把 authoring compiler 的自然语言输出直接当成可执行事实。
- 不建立 World-specific Agent runtime、模型选择器、Memory infrastructure、Asset catalog 或 Desktop manager bag。
- 不创建、编辑、发布或删除 CharacterProject/CharacterVersion，也不把 World-local actor state 回写为角色通用事实。
- 不在本变更中选择具体 `.nk*` 扩展名、远端 marketplace 或云同步协议。

## Decisions

### 1. World 是顶层能力族，不是单一 bounded context

产品导航和组合上，World 是一组共同服务“可创作、可进入、可持续发展世界”的能力；领域实现上必须拆成独立 owner：

| World 子能力       | 创作期 owner                                        | 运行期 owner                                           | 不拥有                              |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------ | ----------------------------------- |
| World Definition   | `WorldProject` / `WorldVersion`                     | —                                                      | 故事进度、玩法状态、角色 canon      |
| World Story        | `WorldStoryProject` / `WorldStoryVersion`           | `WorldStoryRun`                                        | Character Story 进度、World facts   |
| World Gameplay     | `WorldGameplayDefinition`                           | `WorldGameSession`                                     | Agent Play 策略、外部游戏状态       |
| World Experience   | `WorldExperienceProject` / `WorldExperienceVersion` | `WorldExperienceRun` binding                           | 被组合 owner 的事实和生命周期       |
| World Runtime      | —                                                   | `WorldRun` / `WorldSave` / `WorldBranch` / `WorldView` | Character canon、Story 或 Game 进度 |
| World Presentation | profile/reference                                   | renderer/engine/model binding                          | 任何语义事实                        |

World Definition/Runtime 保存语义事实、关系、时间/空间拓扑、通用规则、交互定义和运行状态。Scene 是语义场景，能够被文字、2D、Live2D、音频、游戏引擎或未来空间表现消费；相机、viewport、像素坐标、物理 handle 和 Renderer session 不进入 World facts。

未采用以 Game Engine 为中心的设计，因为当前产品价值是 AI-native 的开放互动、角色一致性、世界持续性和创作回流，而不是低延迟物理控制。未采用纯聊天设计，因为 transcript 无法拥有共同状态、知识可见性、分支和可审计后果。

### 2. 世界创作与世界运行是两个阶段、两组生命周期

```text
authoring
  WorldProject ------------> WorldVersion
  WorldStoryProject -------> WorldStoryVersion
  CharacterProject --------> CharacterVersion
  CharacterProject --------> CharacterStorylineVersion
  WorldGameplayDefinition -- optional
          \ exact refs + mappings + policies
           -> WorldExperienceProject -> WorldExperienceVersion

runtime
  WorldExperienceRun
    -> WorldRun -> WorldSave / WorldBranch -> WorldView
    -> WorldStoryRun
    -> CharacterRun + CharacterStorylineRun (0..n)
    -> WorldGameSession (optional)
    -> Presentation binding
```

创作期 association 决定哪些不可变版本可以共同发布、角色在世界故事中的 role、story synchronization policy、玩法席位映射和表现入口；运行期 association 绑定实际 Run/Save/Branch/Session/participant identity。两者不得共用一个可变记录：修改创作组合不能重定向已启动运行，运行进度也不能写回发布版本。

### 3. WorldProject 只引用 Character owner，不管理角色

`WorldProject` 拥有 `WorldDefinition`、`SceneDefinition`、`WorldActorBinding`、`InteractionDefinition`、`WorldRule` 和 presentation hints。World Story 由独立 `WorldStoryProject` / `WorldStoryVersion` 表达；角色本身由 Chara-owned 不可变 CharacterVersion 表达，地点/组织/物件/风格等稳定语义身份引用 Project Entity/Entity Asset；ContentLocator 与 Asset package 保存表现资源。

`WorldActorBinding` 只保存 actor identity、精确 CharacterVersion ref、World role、初始位置、world-specific knowledge 和参与策略。运行时将其解析为 `WorldActorInstance -> CharacterRun -> primary AgentSession`；位置、物品、伤势、阵营、世界关系、秘密和目标属于 WorldRun/WorldSave，不回写 CharacterVersion。Character 的通用 canon、知识边界、声音、表现和行为策略继续由 Chara 拥有。

World Studio 只能选择或替换精确已发布 CharacterVersion ref，不能创建、编辑、发布、删除 CharacterProject/CharacterVersion，也不能在绑定失效时自动选最新版本或构造 World-local 简化角色。需要原创 NPC 时，用户先在 Character Studio 创建并发布 CharacterVersion，再回到 World Studio 绑定。反向地，Character Studio 只能显示 World-owned 参与、storyline、save 和 branch 摘要并跳转，不得编辑 World facts。

```text
Character Studio -> CharacterVersion -> Character Runtime
                                      \
                                       WorldActorBinding -> WorldActorInstance
                                      /
World Studio ------> WorldVersion ---> World Runtime
```

Character Runtime、Character Story Runtime、World Runtime 与 World Story Runtime 可以独立创建、暂停、恢复和结束。组合体验通过 exact binding 协作；缺少某个可选 owner 时必须表现为显式未绑定，而不是回退到 active/latest identity。

### 4. Character Story 与 World Story 独立管理、显式关联

`WorldStoryVersion` 保存世界级 premise、主题、冲突、章节、possible beat、trigger、clue、escalation、结局与 hard/soft constraint；`WorldStoryRun` 只保存某次世界故事的章节、beat、冲突和结局进度。Planned beat、AI 建议和作者意图都不是已发生事实。

`CharacterStorylineVersion` 保存角色中心的目标、个人冲突、成长弧、关系里程碑与可参与的世界故事角色；`CharacterStorylineRun` 保存该角色在一次具体经历中的个人进度。它归 Chara，而不是 World Story。WorldEvent 可以触发两个 owner 分别评估进度，但不得让一个共享 `storyProgress` 同时充当世界剧情和角色成长的权威。

同一 CharacterVersion 可以参与多个 WorldStoryVersion，并在每次体验中创建独立 CharacterStorylineRun。默认不得把 A 世界的秘密、关系、伤势、任务或成长进度带入 B 世界；需要连续宇宙或跨世界成长时，由 Chara owner 执行显式、可审阅的 journey/transition，记录 source/target storyline run 和接受的转移内容。

原始小说、剧本和设定文档仍由 Text/Content owner 保存；只有显式接受进 WorldStoryProject 或 CharacterProject 的结构化定义才能发布为对应 WorldStoryVersion 或 CharacterStorylineVersion。

### 5. World Gameplay 是可选子能力，Game 不等同于 World

不是每个 World 都有游戏玩法，也不是每个 Game 都需要完整 World。随 WorldExperience 创作和发布的玩法由 World Gameplay 子能力拥有：`WorldGameplayDefinition` 描述玩法目标、席位、动作空间、规则、资源循环、完成/胜负条件和验证；`WorldGameSession` 拥有局内席位绑定、局内状态、合法动作、结果和结束状态。

外部游戏或其他独立应用仍是外部 Activity/Game authority，WorldExperience 只能引用其公开 capability/session contract。无论目标是 WorldGameSession 还是外部游戏，Agent Play 都只拥有规则理解、长期策略、短时控制计划、action proposal 和经授权的 Host control；动作是否有效、状态如何变化、谁胜谁负始终由对应 Gameplay/Game owner 校验。

```text
CharacterRun + authorized observation
  -> Agent Play (plan / propose / control)
  -> WorldGameSession or external GameSession (validate / commit / result)
  -> committed GameEvent/GameResult
```

### 6. Experience 是组合边界，不是新的事实总表

`WorldExperienceProject` 在创作期保存精确 WorldVersion、WorldStoryVersion、CharacterVersion、CharacterStorylineVersion、可选 WorldGameplayDefinition、entry point、role/seat mapping、interaction policy 和 presentation profile 的组合草稿。`WorldExperienceVersion` 冻结该组合并作为发布产物。

`WorldExperienceRun` 在运行期只保存精确参与绑定和协调状态：WorldRun、WorldStoryRun、每个 CharacterRun/CharacterStorylineRun、用户 participant、可选 WorldGameSession 与 presentation binding。它不得复制 WorldState、story progress、game state、Character memory 或 Agent transcript，也不得用统一状态机替代各 owner 的创建、暂停、恢复、结束和错误语义。

### 7. 文本、Web、游戏引擎与世界模型都是可选交互/执行/表现 profile

WorldExperience 可以声明文本/对话、Web/2D、Game Engine、generative World Model、Voice 或其他 interaction/execution/presentation profile。代码、Web、引擎和模型都不是 World core 的必要依赖；作品只需至少一个能够消费 owner-qualified WorldView、接收用户输入并提交 typed intent 的 Interaction Surface。所选 profile 必须由用户或作品入口显式选择并满足该作品声明的 required capability；运行中失败不能静默切换为另一 profile。

- Text/Conversation profile 通过共享 Shell 或 Agent Interaction 呈现 WorldView、角色、事件和声明式 affordance，不要求 Web 场景或游戏引擎。
- Web/2D profile 通过 Webview 渲染 WorldView、Story/Game projection 和媒体 descriptor，并提交 typed intent。
- Game Engine profile 通过 adapter 消费语义定义和已提交事件，拥有可丢弃的引擎对象与低层模拟句柄；需要持久化的语义后果必须由 World/Gameplay owner 校验并提交。
- World Model profile 根据授权 view 生成空间、视觉或行为 proposal/projection；模型隐状态、生成场景和预测结果不是世界事实。

所有 profile 共享同一 World/Story/Gameplay/Experience identity 和事件边界，不建立 text facts、Web facts、engine facts、model facts 多套权威。用户显式切换 presentation profile 时保持精确 Run/Save/branch/participant identity；改变 required execution capability 时必须经过 Experience/Run owner 的显式转换，不能由 Renderer 自行热切换成功路径。

### 8. Canvas、Cut 等是创作工具，不是 World owner

Text/Screenplay、Canvas、Cut、Assets、Generation 与 Preview 分别拥有文档、空间编排、时间线、素材、生成 Job 和预览投影。World Studio 可调用这些工具并引用其 durable artifact/version/content identity；工具不得直接写 WorldVersion、WorldStoryVersion、WorldGameplayDefinition 或运行状态。

当 Canvas 用于编辑世界图或 Story 图时，它只是 World authoring service 的交互 surface；当 Cut 用于制作过场时，产物是可引用媒体/时间线；Preview 只消费 authoring snapshot。所有语义接受、发布和运行写入仍通过对应 World 子能力的 canonical application service。

### 9. Content-to-Experience 是 World Studio 的主创作链

World Studio 接受用户创作意图以及 owning tools 提供的 durable source identity，authoring compiler 只生成带来源的 owner-qualified candidate：World/Scene、World Story/Quest、Character binding、World Gameplay/Interaction 和 Presentation candidate 分别由对应 owner 接受、拒绝或合并。不得建立一个可写所有领域事实的通用 AI document、compiler store 或 Desktop service。

编译固定为：

```text
creative intent + durable source refs
  -> source-scoped extraction / synthesis
  -> owner-qualified candidates
  -> capability resolution + semantic diff
  -> explicit accept / reject / merge
  -> WorldExperienceProject composition
  -> immutable WorldExperienceVersion
```

剧本可以生成 Story chapter/beat/conflict、Quest goal/condition 与 Scene candidate；角色卡和表现素材可以提出精确 CharacterVersion/representation/appearance binding；玩法说明可以提出 action space、goal、rule、result 和 UI affordance。任何候选要求未注册 action、owner、adapter 或 provider capability 时，compiler 必须返回精确 `CapabilityGapDiagnostic`，不得生成任意代码、虚构 handler 或将自然语言说明视为可执行成功。

### 10. 运行中持续改造使用同一语义权威

用户进入 WorldRun 后仍可提出创作意图。Transformation application service 必须先把变化分类为：当前 World state、World structure、World Story/Quest、World Gameplay/Interaction 或 Presentation。每类变化形成 exact target、source/author、base identity、capability requirements、owner-qualified payload 和 semantic diff 的 candidate；只有对应 owner 可以接受并提交。

- 当前状态变化通过 typed intent/event 进入当前 branch；
- 可由现有 canonical schema 表达的结构变化通过 World transformation event 进入当前 branch，并可由用户显式提升为新的 World/Experience version candidate；
- Story/Quest、Gameplay/Interaction 与 Character canon 变化分别进入其 owner 的 review lifecycle；
- presentation-only 变化可以更新当前 presentation binding，但不得修改语义事实；
- 缺失能力、陈旧 base、错误 owner 或不可见 target 必须 fail-visible，原 Run/Save 和 sibling capability 保持可用。

结构性发布不得原地改写不可变 baseline 或把旧 Save 静默重绑到新版本。需要新的 baseline 时创建用户可见的新版本以及显式新 branch/Save binding，并保留原历史；这不是内部 schema migration。

### 11. WorldExperienceVersion 是用户成品，WorldVersion 是可复用底座

`WorldExperienceVersion` 是面向用户的 AI 可执行生成规范，而不是最终渲染内容。它冻结：

- 精确 WorldVersion；
- 精确 WorldStoryVersion；
- CharacterVersion/CharacterStorylineVersion/Entity/Asset dependency；
- 可选 WorldGameplayDefinition；
- entry point 与 participant stance；
- interaction、director 与 narration policy；
- primary/optional presentation profile；
- required/optional interaction、execution、Agent/AI 与 presentation capabilities，以及只对实时能力适用的 latency/stream/interruption qualification；
- exact dependency、integrity、provenance 和 license metadata。

发布时外部可变 project ref 必须变为不可变版本 ref、package member 或显式锁定 dependency；故事、图片、视频、声音、角色卡和其他素材只作为经审阅的 canon/constraint 来源、runtime grounding 或表现 reference，不作为固定播放顺序。Secret、模型凭据、本机路径和用户状态不得进入包。安装只注册不可变作品，不自动创建 WorldSave；启动时才创建 run/save。

### 12. Participant stance 与 controller identity 是显式运行事实

首版支持 `observer | participant | embodied-character | director`。Stance 在 Run 创建时绑定：

- observer 只读；
- participant 以用户世界身份提出行动；
- embodied-character 绑定一个允许用户控制的 WorldActorInstance，不再启动隐藏的角色 Agent；
- director 只能在作者允许的范围创建候选、分支或受控导演事件。

AI 不得从自然语言自行升级 stance。participant、controller、run、branch、actor identity 由 Host/application binding 提供，模型输出同名字段不具有授权效力。

### 13. 每个运行 owner 只提交自己的事实

所有用户、角色、Director 与系统行为先成为绑定 owner 的 typed intent，携带 source identity、target、action kind、arguments、observation revision 和 expected owner revision。World application service 只验证并提交 WorldEvent/WorldState；World Story service 只提交 WorldStoryProgressEvent；World Gameplay service 只提交 GameEvent/GameResult；Chara 只提交 Character Story progress 和角色记忆。失败返回 owner-qualified typed rejection。

跨 owner 的因果链采用“已提交事实 -> 候选 -> 各 owner 独立接受”的方式，不要求分布式原子写入，也不复制事实：

```text
user / Character / Director intent
  -> World or Gameplay validation
  -> committed WorldEvent / GameEvent / GameResult
  -> WorldStoryProgressCandidate ----> WorldStoryRun accepts/rejects
  -> CharacterStorylineProgressCandidate -> CharacterStorylineRun accepts/rejects
  -> refreshed Experience projection
```

`WorldExperienceRun` 可以记录协调结果和关联 identity，但不能代表某个 owner 已提交尚未接受的进度。单个 Story/Game owner 失败只暂停相关能力并保留其他 Run 可用。

未知 action、陈旧 revision、缺失 identity、不可见 target 和未注册 resolver 均 fail-visible；不得把自由文本输出、聊天完成或空 effect 当作成功事件。

### 14. AI 只能消费授权 WorldView 并产生不可信 proposal

每个 AI role 使用独立 scope：

| Role                    | 输入                                                         | 允许输出                                                                |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Intent Interpreter      | 用户输入、stance、当前 interaction schema 与用户 WorldView   | typed user intent candidate                                             |
| Character Agent         | CharacterVersion、角色 memory view、角色专属 WorldView       | utterance/action intent                                                 |
| World Director          | WorldStoryVersion、允许的全局导演投影与 policy               | participant scheduling、story progress/event candidate                  |
| Rule Evaluator          | 单个 World/Gameplay action、相关规则和裁剪状态               | resolution evidence/candidate                                           |
| Narrator                | 已提交事件和目标参与者 WorldView                             | 叙述表现                                                                |
| Generative Presentation | WorldView、presentation profile、经审阅 grounding 与授权资源 | 满足实时 contract 的流式 image/audio/video/spatial projection candidate |

Character utterance 只是 speech event，不会自动成为 WorldFact。Director proposal、Rule output、Narration 和生成媒体也不直接修改 State。Prompt injection、模型伪造身份或模型遗漏字段都被 strict codec、Host binding 和 owner validation 隔离。

### 15. AI capability 按作品逐项声明，不是 World 的共同前提

WorldExperienceVersion 将 deterministic action handlers、Intent Interpreter、Character Agent、World Director、Narrator、Agent Play 和生成式表现分别声明为 required 或 optional capability。Host 只为实际声明的 AI capability 解析用户配置，并在对应 Run/turn boundary 冻结确切 provider/model/parameters receipt；credential 不进入 World package、prompt、日志或存档。没有消费期 AI requirement 的作品可以通过确定性 Runtime 与文本、Web、引擎或其他 Interaction Surface 启动，Host 不得强制绑定模型或把它降级为“非 World”。

缺失 required capability 或当前 binding 未通过该作品要求时，只让相关 Experience/profile unavailable；optional capability 缺失必须产生可见 diagnostic 并保持其余 canonical path 可用，但不得自动替换为另一 provider、handler、profile 或事实来源。Provider 不存在时 World package、save、deterministic interaction 和 committed replay 仍可按作品声明继续工作。

### 16. 实时 contract 只约束作品选中的实时能力

World 的实时 AI 是持续会话式 soft real-time，而不是 Game Engine 帧循环。只有作品声明为实时的能力才需要由真实目标环境验证：输入确认预算、首个有效流式响应预算、连续输出/心跳要求、可打断和取消语义、状态提交 deadline、presentation 更新预算、最大并发角色/流，以及 latency miss 的失败行为。具体数值由实现阶段基于首个 qualified 本地/外部模型和目标硬件冻结，不能由 Provider manifest 自证。确定性 action 或非实时 authoring compiler 不得伪造 realtime receipt，也不因没有 realtime contract 被拒绝。

Runtime 固定为：

```text
user input
  -> immediate bound acknowledgement
  -> streaming intent/Character/Director inference
  -> validated WorldEvent commit
  -> continuous WorldView/presentation stream
```

模型或表现 provider 超过当前 deadline、失去 stream、无法响应 interruption 或返回陈旧 revision 时，World 必须取消/拒绝对应 proposal，暂停受影响的实时能力并返回 diagnostic；迟到结果不得提交、不得替换当前 Scene，也不得通过异步 fallback 伪装实时成功。Retry/resume 只能重新绑定当前 revision 并遵守同一 profile。

普通 GenerationJob、离线图片生成、异步视频生成和高质量导出属于传统 authoring/output path。它们可以在发布前产生 grounding/reference asset，或在 WorldSave/Replay 之后导出传统作品，但不能成为 active World Run 的必需或增强成功路径。只有在真实持续测试中满足 latency、stream、cancellation、identity consistency 和 resource budget 的生成式 image/video/spatial provider，才能注册为 realtime presentation profile。

### 17. Save 使用版本基线、事件流和周期 checkpoint

`WorldSave` 绑定 base WorldExperienceVersion、run/branch identity、parent branch/checkpoint、ordered committed events、周期 checkpoint、current revision 和 participant/actor binding。事件流解释发生了什么，checkpoint 加速恢复；UI/search/summary projection 可重建，不是权威。

恢复固定为 `exact base WorldExperienceVersion + checkpoint bound to that Save + subsequent events -> WorldState`。Replay 读取已提交事件，不重新调用模型生成过去。模型 receipt 可以记录 purpose、binding revision、输入 world revision 和 proposal/event identity，但不保存 secret 或把隐藏模型 state 当作恢复依赖。

从旧 checkpoint 继续必须创建新 branch，不能改写历史。新的 WorldExperienceVersion 不得静默重绑旧 Save；若产品允许升级，必须由用户显式选择目标版本，由 World owner 校验后创建新的 Save/branch identity并保留原 Save。该操作是用户可见领域版本升级，不是内部 codec migration、兼容 reader 或版本分发。

### 18. 首个内置 Interaction Surface 是文字流加可选 2D 组合

首个内置 Interaction Surface 使用文字输入、世界/角色/事件投影与声明式 affordance；当作品声明相应 presentation capability 时，可组合已发布的 2D 场景、角色立绘、未来 Live2D、流式语音或环境音。自然语言只在作品声明 Intent Interpreter 时可作为开放输入；没有该能力时 UI 仍可通过结构化 affordance 提交相同 typed intent。表现更新不得等待普通 GenerationJob。

预生成互动影像只能作为发布素材按已提交状态选择；新生成的非实时图片/视频不进入 active Run 的当前表现成功路径。生成式空间 World Model 只有满足作品声明的资格时才能产生 WorldView projection，且仍不拥有世界事实。Game Engine profile 只有在对应 adapter、必要 Gameplay contract 与真实运行验收完成后才能启用。每个作品声明一个或多个完整、可启动的 interaction/execution/presentation profile，Host 不自行猜测或静默降级。

### 19. World Library 是 Desktop projection，不是 Game Hub 或事实 owner

Desktop Home 首先提供独立 World Studio/Library：已安装/创作 WorldExperienceVersion、最近 Run、存档/分支、作品详情、capability status、继续/新体验。World Studio 组合 World Definition、World Story、World Gameplay、Character/Character Storyline reference、创作工具产物和发布；World Runtime 展示独立 WorldRun、WorldStoryRun、CharacterStorylineRun、可选 WorldGameSession、存档、分支和回放。启动配置只包含 entry point、stance、可选 embodied character、save/branch 和作者允许的 execution/presentation profile，不进入 Character Studio 修改角色。

系统级模型、凭据、语言、隐私、无障碍和默认表现设置继续由 Desktop/owning settings service 管理；World Studio 拥有作者配置。普通用户设置不得直接修改 Story、Character policy、WorldRule 或 CharacterVersion。

### 20. Package 与 runtime 边界按真实依赖闭包演进

现有实现使用 host-neutral `@neko/world` 与独立 `@neko/world-node`，后续应以显式 `./contracts`、`./application`、`./testing` 及 Story/Gameplay/Experience public subpath 隔离职责。若 L0 contract 被 Webview/其他 contracts 消费而 application 引入更重依赖，或 Story/Gameplay/Webview 形成独立构建闭包，再按 package taxonomy 拆分，不得为了能力表或目录对称预建空包。

Canonical producer 是 World package public authoring/publication/runtime service；consumer 是 Chara/Agent adapter、Node repository、World Webview port 和 Desktop composition。Desktop 只保留 Electron sender/path/trust boundary、typed IPC、View/Window lifecycle、native dialog、public port wiring 与 disposal，因为这些逻辑真实依赖 Application 层；所有可脱离 Electron 的规则、事务、codec、projection 和恢复编排留在 World owning package。

完整 WorldExperience product entry 只有在 Definition/Runtime、World Story、可选 World Gameplay、Experience、persistence 和所选 profile producer 均按作品要求组合后，才通过 `unify-agent-launch-and-domain-bindings` 的 typed World binding/context port 向 Agent 贡献 exact WorldExperienceVersion 或 WorldRun、participant、stance、branch 和 participant-scoped WorldView。Agent 只拥有 Draft/Conversation/Turn、Play 与 AI role session，不得从文本或 active Scene 推断 World identity，也不得提交 World/Story/Gameplay state。所需 provider 未组合时，只有该 Experience 启动保持 owner-qualified unavailable，现有 Foundation 和无关能力继续可用。

### 21. 项目事实、本地状态和表现资源保持分离

WorldProject 与 portable WorldSave 使用稳定的 owning-domain 文件结构；WorldVersion 和 WorldExperienceVersion 是用户可发布、选择和绑定的不可变业务版本身份。具体 workspace-relative canonical path 和扩展名由实现 OpenSpec 冻结。用户级 SQLite 只保存 installed catalog、recent run、恢复索引、attention 和可重建 Search projection。素材由 Generation/Content/Asset owner 在 authoring 时提供 durable ContentLocator，并在发布后作为 grounding/reference 被实时 Context Materializer裁剪使用；普通 Generation runtime、cache、opaque URL 和 runtime token 不进入 World Run 或 facts。

## Risks / Trade-offs

- [World 被理解为一个万能 domain] → World 只在产品层是能力族；Definition/Runtime、World Story、World Gameplay、Experience 和 Presentation 使用独立聚合、运行身份和 public contract。
- [Character Story 与 World Story 共用进度造成跨世界污染] → CharacterStorylineRun 与 WorldStoryRun 独立提交；每次体验创建精确绑定且默认隔离，跨世界延续只能通过显式 journey/transition。
- [Experience 成为新的统一 Session/事实总表] → Experience 只拥有发布组合和运行绑定，不复制 WorldState、Story progress、Game state、Character memory 或 Agent transcript。
- [World Studio 变成第二个角色管理器] → WorldActorBinding 只引用精确 CharacterVersion；World 不写 CharacterProject/Version，失效绑定局部报错并跳转 Character Studio 修复，不自动选择最新版本。
- [“Gameplay 属于 World”导致 World core 或表现 UI 吸收游戏规则] → 作品内玩法归 World Gameplay 子能力的独立 aggregate/runtime；外部游戏仍归外部 Game authority；Agent Play 与 Renderer 只消费公开 contract。
- [Web、Engine、World Model 形成三套事实] → profile 仅拥有表现资源和低层执行句柄，所有语义后果仍由 World/Story/Gameplay owner 校验并提交。
- [Canvas/Cut 直接写世界或剧情] → 创作工具拥有自己的 artifact；World Studio 只引用产物并通过对应 authoring service 接受语义。
- [开放自然语言导致任意状态变化] → AI 只产生 registered typed intent，未知 action 和未注册 resolver fail-visible。
- [角色泄露隐藏信息] → save owner 先按 branch/time/location/knowledge/visibility materialize immutable Character WorldView，模型永不接收未授权事实。
- [World Director 为推进故事强行改写世界] → Story beat 是 opportunity；Director 只能提交 candidate，World rules 和 revision commit 仍是权威。
- [不同模型产生不同结果，难以回放] → 保存 committed event 与 execution receipt，Replay 不重新调用模型。
- [外部模型和网络抖动破坏实时体验] → 发布包声明实时 contract，启动前做目标环境 qualification，运行中按 deadline/stream/cancel fail-visible，迟到结果永不写入当前 revision。
- [把等待图片或视频包装成实时互动] → 普通 GenerationJob 完全移出 World Run；只有通过持续实时资格的 provider 才可注册 presentation profile。
- [2D 产品外观被误解为视觉小说或聊天] → 产品和 contract 同时展示世界状态、自由行动、多人 observation、事件、save 和 branch，Story 不拥有线性执行权。
- [生成媒体被误当成世界事实] → presentation output 绑定 source WorldView/event revision，只能通过独立 authoring review 产生新 fact candidate。
- [作品更新破坏旧存档] → 发布包不可变，save 锁定 base version；迁移必须显式、可测试、可拒绝。
- [初期包拆分过度] → 从单一 host-neutral owner 与明确 subpath 开始，只按运行时/依赖闭包真实分裂。
- [Agent Play 或外部游戏再次侵入 World core] → Play/VLA/Computer Use 由 Agent/Host 边界处理，外部游戏由其 Game authority 处理；architecture tests 禁止相应实现依赖进入 World Definition/Runtime。

## Migration Plan

1. 先合入本 OpenSpec，不改变 Desktop unavailable 状态，不创建生产空包或用户数据。
2. 以 `define-character-dialogue-chatroom-world-foundation` 的 WorldVersion、Run、Intent、Event、State、View、Save 与 branch 为前置 canonical authority；先收敛现有 Foundation 中的 event authority 与 checkpoint projection，再扩展新 owner。
3. 建立 World Story、World Gameplay 和 World Experience 的独立 contract、identity、repository port、architecture tests 与合成 fixture；Character Story 由 Chara 变更拥有，本变更只定义消费 ref 和组合协议。
4. 实现创作期 Experience composition 和运行期 Experience binding，使用路径断言证明没有统一 mutable session、第二套 Agent、跨世界 CharacterStorylineRun 复用或 app-owned World workflow。
5. 接入 CharacterVersion/CharacterRun/CharacterStorylineRun、Entity/Asset/Content、AgentSession/Play 和可选外部 Game adapter；跨 owner 只传递 typed intent、committed event、candidate 与 projection。
6. 实现文字+2D World Webview、Desktop World Library、typed IPC 和隔离 fixture workspace；完成真实 Electron 入口、reload、切换、关闭与资源释放验收后才将 surface 标为 ready。
7. 后续独立变更增加通过资格的 Game Engine、Voice/Live2D、image/video/spatial World Model profile；非实时动态 Generation 继续留在传统 authoring 和 Replay 导出路径。
8. 将现有生产 World Foundation scene 封闭为 unavailable，旧 presentation 局部重置为 Agent Entry；保留全部 durable World facts。
9. 由五个 follow-up changes 分别承接未完成设计，不在本 change 继续堆叠完整产品任务。

取消本方向时可删除尚未进入生产组合的 World contracts/package和Desktop route。若已经产生 WorldProject、WorldExperienceVersion 或 WorldSave，必须保留读取/导出或提供显式迁移，不能按 cache 删除。

## Open Questions

- 首个持久格式采用单文件还是 project/package directory，以及 WorldProject、发布包和 Save 的具体扩展名。
- World Story 与 World Gameplay 首版作为 `@neko/world` 内独立 subpath/aggregate，还是基于真实依赖闭包立即拆成 package family；无论物理拆包与否，public contract 和 lifecycle 必须独立。
- Character Storyline 的 Chara public contract、CharacterStorylineVersion/Run 持久化位置与跨世界 journey/transition 审阅模型。
- WorldExperienceVersion 的 dependency 是全部内嵌以保证离线可移植，还是允许锁定已安装 immutable Asset package；需与 Asset publication 格式共同确定。
- 首个 World Director 的触发、轮次预算、闲置角色调度和用户可控程度。
- 首个默认 2D presentation 对场景图、立绘、Live2D、Voice 的 required/optional 划分。
- 首个 Game Engine profile 的语义 action/state 边界、低层模拟 checkpoint 与 World/Game committed event 的对应关系。
- 首个实时 contract 的输入确认、首响应、连续 stream、状态提交、表现更新、interrupt/cancel 和 latency-miss 预算，以及用于资格验证的目标硬件与 Provider 矩阵。
- portable WorldSave 是否属于作品目录内可同步文档，还是同时支持用户私有 save repository；隐私、分享和导出需要独立产品决策。
