## Context

OpenNeko 已经定义内容创作、角色 IP 和互动世界三类闭合 Project Profile。角色 IP 需要组合 Agent、Entity、Roleplay、记忆、Voice、2D/3D 表现、感知/设备和角色局部行为；互动世界需要组合 Agent、Entity、已发布角色、场景表现、规则、事件、Gameplay、运行、存档与回放。如果没有明确的领域聚合层，应用根会吸收领域语义，或者各底层包之间直接互相导入并形成循环依赖。

当前仓库只有 Entity、角色对话、Asset binding 和只读 Preview 等部分能力；Device/Live、通用角色 runtime、Character Project、World Project、持久 Scene/Puppet authoring 均不是当前已接受的可执行产品路径。因此设计必须同时给出目标边界和未实现路径的 fail-visible 约束。

## Goals / Non-Goals

**Goals:**

- 为角色 IP 和互动世界确定唯一顶级领域 owner。
- 区分领域聚合、底层能力实现和应用 Composition Root。
- 让角色扮演、NPC 和世界协作完全复用唯一 Agent loop。
- 防止角色状态、世界状态、Agent session、run 和 save 身份混用。
- 用单向 ref/port/adapter 连接 Character 与 World，避免循环依赖。
- 明确 Character Gameplay 与 World Gameplay 的所有权。

**Non-Goals:**

- 在本变更中创建 `neko-chara`、`neko-world` 或任何运行时代码。
- 恢复已删除的 Device/Live、Scene/Puppet、Model 或 Engine 路径。
- 冻结 Character/World 项目文件格式或所有 DTO 字段。
- 建立通用插件平台、ECS、工作流引擎或第二套 Agent runtime。

## Decisions

### 1. Character 与 World 是平级顶级领域聚合包

目标包层级为：

```text
packages/neko-agent
packages/neko-entity
packages/neko-chara
packages/neko-world
packages/neko-assets
...
```

这里的“顶级”表示 bounded context 级领域包。真正实例化 Pi runtime、Device adapter、Renderer、Engine client 和窗口生命周期的 Composition Root 仍位于 `apps/neko-desktop`、`apps/neko-vscode` 或其他宿主应用。

`neko-chara`、`neko-world` 可以提供 package-owned core、runtime、agent-contribution、host adapter 和 UI public entry，但不得嵌入 `packages/neko-agent/packages/`，也不得成为所有底层实现的复制容器。

### 2. `neko-chara` 以可发布角色 IP 为聚合中心

角色领域主线是：

```text
CharacterProject
  -> CharacterVersion
  -> CharacterRun
```

- `CharacterProject` 拥有角色身份创作、人格/知识/关系、表现绑定候选、声音、记忆策略、能力策略、测试和审阅事实。
- `CharacterVersion` 是可被 Home 角色库、内容项目和世界项目稳定引用的已发布版本。
- `CharacterRun` 是一次角色互动/调试运行，拥有显式 run identity，并绑定独立 Agent session、短期上下文、表现 session 和感知 session。
- Entity 继续拥有跨领域稳定实体与证据事实；Assets 继续拥有素材与绑定资源；Renderer、Voice、Device/Perception 和 Engine 继续拥有具体实现。角色领域只保存稳定 ref、选择、策略和角色语义绑定。

Roleplay 默认属于 `neko-chara` 的运行能力。只有出现独立于 Character IP、被多个领域以相同生命周期和错误模型复用的真实需求时，才通过后续 OpenSpec 提取中立 roleplay 包。

### 3. `neko-world` 以可运行、可保存的世界为聚合中心

世界领域主线是：

```text
WorldProject
  -> WorldVersion
  -> WorldRun
  -> WorldSave / Replay
```

- `WorldProject` 拥有 lore、地点、场景、实体引用、剧情、规则、事件和初始状态。
- `WorldVersion` 是可启动运行的已发布世界定义。
- `WorldRun` 拥有显式 world/project/run identity、时钟、事件游标、参与者实例和运行状态。
- `WorldSave`/Replay 拥有世界局部关系、事件经历、任务、经济、成长、战斗和其他运行事实。

World Agent、NPC Agent 或导演视角只是不同 session/context/capability projection，不是新的 Agent 内核。所有世界 mutation 必须由 World runtime 校验并提交；Agent 只能通过 typed Tool/operation 提议或执行被授权的操作。

### 4. 世界通过 CharacterVersion 和 WorldCharacterBinding 使用角色

跨域主路径是：

```text
CharacterProject
  -> publish CharacterVersion
  -> WorldCharacterBinding
  -> WorldActorInstance
```

`WorldCharacterBinding` 可以添加 world actor identity、世界角色、初始位置、阵营和世界局部策略，但不能复制或私自改写 CharacterVersion。当前地点、库存、关系进度、任务状态和世界经历属于 WorldRun/WorldSave。

Ambient NPC 可以由 world-local archetype 创建，不要求先存在完整 CharacterProject。将 world-local NPC 提升为长期角色 IP 必须经过显式 candidate/publish handoff，并保持既有存档和回放不被改写。

### 5. 两个领域完全复用 Agent 底层，但不把领域事实交给 Agent

统一调用链是：

```text
CharacterRun / WorldRun
  -> Character/World application service
  -> injected AgentSessionPort
  -> create or resume neko-agent AgentSession
  -> inject domain context + allowed capability projection
  -> Pi Agent loop
  -> typed Tool / Task / Approval
  -> owning Character or World operation
  -> domain event / revision / diagnostic
```

Agent 拥有模型调用、turn loop、Tool、Task、Approval、事件、取消、transcript 和 compaction。Character/World 分别拥有身份、版本、run、save、记忆策略、表现绑定、规则和项目事实。不得新增 `RoleplayAgent`、`CharacterAgentExecutor`、`WorldAgentRuntime` 等平行通用循环。

角色或世界可以提供 `agent-contribution` adapter，将领域上下文、Tool 和 capability prompt 投影给 Agent；该 adapter 不拥有领域事实，也不能导入 Agent 私有实现。

### 6. 依赖保持单向，跨域环境交互通过 adapter 组合

允许的依赖是：

```text
neko-world -> public CharacterVersionRef / EntityRef / ResourceRef
neko-chara -> public EntityRef / ResourceRef / Agent capability contracts
application host -> chara + world + agent + concrete providers
```

禁止 `neko-agent` 导入 Character/World，禁止 `neko-chara` 导入 `neko-world` 私有实现，禁止双方通过 active singleton 共享运行状态。角色在世界中感知或行动时，由宿主组合的 World/Environment adapter 实现角色运行所需的窄 port；World 可以消费 Character 公共版本/ref，但 Character core 不知道具体 World runtime。

### 7. Character Gameplay 与 World Gameplay 分离

Character 只拥有可移植的个体能力：说话、动作、表情、移动意图、感知、交互 affordance 和个体行为策略。World 拥有地图、目标、任务、规则、战斗、经济、成长、事件调度和整体胜负状态。

Character action 必须经过 World runtime 的规则、权限和 revision 校验后才能成为世界事实。两个领域不得分别实现完整 Gameplay 状态机，也不得用 Agent transcript 代替运行状态。

### 8. 未实现能力保持 fail-visible

架构名称不构成 package、codec、Provider 或 UI 已实现。进入实际实施前，需要独立 OpenSpec 定义 Character/World contract、数据处置和验收。当前已删除或未接受的 Device/Live、Puppet/Scene、持久 2D/3D authoring 和 World runtime 不得通过旧 command、fallback、空 provider 或成功 no-op 恢复。

### 9. Host 只负责实例组合，领域 application service 负责编排

应用 Host 是 concrete Composition Root，但不是 Character 或 World 的业务 orchestrator：

```text
Desktop / VS Code / TUI Host
  -> construct CharacterApplicationService
  -> construct WorldApplicationService
  -> inject AgentSessionPort / storage / renderer / device / engine adapters
  -> own host lifecycle and resource disposal

CharacterApplicationService
  -> create / resume / dispose CharacterRun
  -> capture character context and capability policy
  -> coordinate roleplay turn and memory candidate

WorldApplicationService
  -> create / resume / dispose WorldRun
  -> validate action and expected revision
  -> commit WorldEvent, save, branch and replay facts
```

Host 不判断角色该如何回应、不选择 NPC 行为、不提交世界状态、不决定记忆晋升，也不通过 active tab 选择 run。Character/World application service 依赖各自 package-local、consumer-owned port；具体 Agent、Renderer、Device、Engine adapter 由 Host 注入。这样 VS Code、Desktop 和 TUI 只替换宿主 adapter，不复制领域流程。

### 10. Actor、CharacterRun 与 AgentSession 只有一个 canonical owner

运行身份映射如下：

```text
published character in a world
  WorldActorInstance -> characterRunId -> primary agentSessionId

ambient world-local NPC
  WorldActorInstance -> optional world-local actor agentSessionId

world director / narrator
  WorldRun -> independent world-level agentSessionId
```

引用 CharacterVersion 的 world actor 必须通过一个 CharacterRun 承载角色身份、表现、感知和主要智能 session；WorldActorInstance 只保存 world binding 与 `characterRunId`，不得为同一 actor 再创建第二个 NPC AgentSession。Ambient NPC 不要求创建 CharacterProject/CharacterRun，其可选智能 session 由 world-local actor controller 拥有。World Director 是 world-level scope，不伪装成某个 actor。

每个 CharacterRun 同一时刻至多映射一个 primary AgentSession。Branch、重开和恢复必须显式产生或更新映射；run identity、agent session identity、world actor identity 和 world run identity 不得互换或由 active selection 推断。收到缺失、陈旧或不匹配 identity 的 event/operation 时 fail-visible。

### 11. 有效能力是多层策略交集

角色/世界运行的有效工具和 capability 由以下策略取交集：

```text
EffectiveCapabilities =
  HostPermission
  ∩ WorkspaceTrust
  ∩ CharacterVersionCapabilityPolicy
  ∩ WorldCharacterBindingPolicy
  ∩ CurrentRunScope
```

不适用的层视为不增加限制，而不是授予能力。任何下游 policy 只能收窄上游授权，不能注册同名工具覆盖 deny，也不能通过 Skill、Prompt、World binding 或 provider metadata 获得权限。Turn 开始时捕获 effective policy snapshot 供模型上下文和 Tool resolution 使用；真正产生副作用的 owning operation 在提交时重新校验当前 host permission、run identity、domain revision 和必要 approval，避免长回合使用陈旧授权。

Capability policy 是领域事实和运行约束；Agent/Host 负责强制执行，但不拥有 Character/World policy 的业务含义。被过滤工具不得进入该 turn 的可调用目录；显式调用被拒绝时返回 typed diagnostic，不能转成普通 prompt 或 no-op success。

### 12. Character action 通过 revisioned WorldAction contract 提交

Character 不直接修改 World store。跨域 mutation 使用显式事务请求，最小语义包括：

```ts
interface WorldActionRequest {
  readonly worldRunId: string;
  readonly actorId: string;
  readonly characterRunId?: string;
  readonly actionId: string;
  readonly expectedRevision: number;
  readonly intent: CharacterIntent;
}

type WorldActionResult =
  | {
      readonly kind: 'committed';
      readonly revision: number;
      readonly events: readonly WorldEvent[];
    }
  | {
      readonly kind: 'rejected';
      readonly diagnostic: WorldDiagnostic;
    };
```

这里的类型只冻结必需语义，不代替后续实现 OpenSpec 的正式 schema。World runtime 必须校验 world run、actor/character binding、action idempotency、expected revision、当前规则、权限和资源条件，再原子提交事件与 revision。陈旧 revision、重复 action、错误 actor、已停止 run 或规则拒绝均返回明确 diagnostic，不自动改投 active world、不隐式重试，也不由 Character/Agent 直接修补 World state。

### 13. 记忆事实、派生索引和晋升路径分离

记忆所有权固定为：

| 记忆或能力 | Owner | 规则 |
| --- | --- | --- |
| 角色核心知识、长期记忆与记忆策略 | CharacterProject/CharacterVersion | 跨项目、版本化，发布后不可被运行静默修改 |
| 单次角色互动产生的记忆候选 | CharacterRun | run-scoped，默认不是长期事实 |
| 世界关系、事件和经历 | WorldSave | save-scoped，不自动进入角色版本 |
| embedding、压缩、索引、召回排序 | Memory infrastructure | 可重建派生能力，不拥有领域事实或晋升决策 |

唯一允许的跨生命周期路径是显式 review/promotion：CharacterRun memory candidate 或 WorldSave experience 先成为可审阅候选，再由 CharacterProject owner 接受并发布新的 CharacterVersion。Memory infrastructure 只能读取授权 snapshot、产生候选或索引，不能直接写 CharacterVersion、WorldSave 或 Agent transcript，也不能把召回结果伪装成已确认事实。

### 14. 持久绑定与 host-private 运行句柄分离

CharacterProject/Version 和 WorldProject/Version/Save 只能保存可移植、稳定、可审计的 identity，例如 `EntityRef`、`ResourceRef`、`RepresentationRef`、`VoiceProfileRef`、`MotionSetRef`、CharacterVersionRef 和 provider-neutral policy。以下值只能存在于 run-scoped host adapter：

- 摄像头、麦克风或其他设备 handle/临时枚举 ID；
- Renderer、Voice、Device、Engine 的 live session handle；
- Webview URI、blob URL、localhost URL、进程 ID 和授权 token；
- 绝对 cache path、provider client object 和临时文件位置。

恢复 CharacterRun/WorldRun 时必须从持久 ref 重新解析并授权具体 provider；缺少 provider、资源或权限时返回 unavailable diagnostic。不得持久化 live handle、通过 active device/renderer fallback，或在恢复失败时伪造空表现/空感知成功。

### 15. 包内模块边界必须可静态验证

目标依赖层级是：

```text
chara/core -> shared refs and domain values
chara/application -> chara/core + package-local consumer ports
chara/adapters/agent -> chara application ports + public Agent contracts
chara/host-* -> public chara entry + concrete host adapters

world/core -> shared refs + public CharacterVersion/ref contracts
world/application -> world/core + package-local consumer ports
world/adapters/agent -> world application ports + public Agent contracts
world/adapters/chara -> world ports + public chara contracts
world/host-* -> public world entry + concrete host adapters
```

`core` 不得导入 Agent、VS Code、React、Renderer、Device、Engine 或另一领域的私有 runtime。`agent-contribution`/adapter 可以依赖 Agent 公共 contract，但不能成为 core 的反向入口。Package public exports 应区分 contracts/core、application 和 host adapter，并通过 architecture test 检查禁止 import、循环依赖和 Extension/Webview 越界。

## Risks / Trade-offs

- [聚合包演变成大杂烩] → 只拥有聚合根、策略、binding 和 runtime coordination；具体 Agent、Entity、Renderer、Device、Engine 实现留在原 owner。
- [Character 与 World 循环依赖] → World 单向引用 CharacterVersion；运行期反向交互由宿主 adapter/窄 port 注入。
- [角色与世界重复 Gameplay] → Character 限于个体 affordance/策略，World 拥有完整规则和运行状态。
- [多 Agent 展示诱发多内核] → 所有 scope 使用同一 `neko-agent`/Pi canonical path，以 session/context/capability projection 区分。
- [世界经历污染全局角色] → WorldSave 保持 save-scoped；只有显式审阅和发布才能形成新 CharacterVersion 或角色记忆。
- [目标设计被误报为当前能力] → 文档和 package boundaries 标记为拟议/未实现；实施前必须有独立 OpenSpec 和路径级验收。
- [Host 吸收领域编排] → Host 只构造和注入 application service；Character/World 业务流程由 package-owned service 管理。
- [同一 NPC 重复 AgentSession] → CharacterVersion actor 固定为 WorldActorInstance -> CharacterRun -> primary AgentSession；ambient actor 与 World Director 使用不同显式 scope。
- [多层 policy 互相覆盖] → effective capability 使用交集，turn 捕获快照，副作用提交时重新校验权限、identity、revision 和 approval。
- [角色直接修改世界] → 所有跨域 mutation 使用 revisioned WorldAction，World runtime 是唯一 commit owner。
- [持久项目泄露本机句柄] → 项目只存稳定 ref；device/renderer/engine handle 保持 run-scoped、host-private 并在恢复时重新解析授权。

## Migration Plan

本变更只有文档迁移，不创建运行时路径。后续实现顺序必须是：

1. 分别为 Character 和 World 创建实施 OpenSpec，冻结最小聚合根、identity、数据格式和旧数据策略。
2. 先定义 public ref、package-local consumer port、Agent session mapping、effective capability policy、WorldAction 和 memory promotion contract，再创建 domain core/runtime。
3. Character 首先接通 Entity、统一 AgentSession 和一种最小 representation/roleplay 路径；World 首先接通 WorldProject、WorldRun、CharacterVersion/CharacterRun binding、revisioned action 和 Save。
4. Device/Live、2D/3D authoring、复杂 Gameplay 和插件贡献分别按真实需求进入后续变更。
5. 每条新路径必须证明使用唯一 Agent loop，并 poison 本次边界内被替代的旧 responder、command 或 fallback。
