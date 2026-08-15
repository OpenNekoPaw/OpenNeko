## Context

当前 Agent Root 同时承载 Entry Draft、Assistant/Workspace Conversation 和角色入口，但能力由多个互不一致的状态决定：`AgentRootPresentation.kind` 控制 UI，launch connection scope 控制 catalog，renderer-local `entryWorkspaceTarget` 控制首次提交，`conversationId` 控制 command/Skill invocation，部分内容能力仍读取 current Project。结果是 Workspace 标签可以显示“已就绪”，而 `@` 搜索没有 Workspace authority；launch catalog 已有 command/Skill，Entry composer 却显式禁用菜单；角色入口通过特殊文本走另一条 handler；模型可以出现在选择器中，却在发送后才暴露缺失运行参数。

现有 `AgentConversationContext` 和 launch scope 只表达 Assistant/Workspace，`AgentHomeConversationOwnerRef` 另行表达 Character/Room，未来 World 设计又明确要求 World 拥有状态与事件 authority、复用唯一 AgentSession。活跃 `compose-desktop-workbench-scenes` 同时声明 bound Character/Room Draft 和“尚不实现对应 owner”，其 verification 还把 Entry command/Skill 标记为已启用，与生产代码不一致。本变更必须先收敛 contract 与 owner，再扩展 UI。

### 五层分析

| 层   | 结论                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent 拥有 Draft submit、Conversation、Turn、catalog composition 与模型配置；Workspace、Chara、World 各自拥有领域事实和可授权上下文；Desktop 只拥有 Electron 信任边界与 Scene wiring。 |
| 依赖 | Host-neutral launch/context/config 逻辑进入 `@neko/agent-runtime/application`；领域 package 通过窄 port 接入；Renderer 不读取文件、项目事实或 domain runtime。                         |
| 接口 | 复用并扩展 package-owned `AgentInputCatalogEntry`、Launch Draft、Conversation context、effective configuration 和 capability contracts；不新增内部 contract 版本或平行 route。         |
| 扩展 | 新领域通过显式 discriminated binding 与 composition-time provider 接入；未实现 provider 返回 owner-qualified unavailable，不使用 wildcard/default registry。                           |
| 测试 | Contract、application、producer/consumer、无旧路径、真实 Electron 和真实 provider Agent Evaluation 分层证明 exact owner、typed invocation、配置与恢复。                                |

### Requirement ownership matrix

| Concern                            | Canonical owner in this change                                                                | Adjacent change responsibility                                                                          | Forbidden overlap                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Draft/Session phase and binding    | `agent-launch-domain-binding` / `@neko/agent-runtime/application`                             | `compose-desktop-workbench-scenes` only mounts the projected Agent Root and commits the resulting Scene | Workbench inferring target, input capability or Conversation owner                     |
| Scene handoff                      | Window Scene authority consumes a committed Agent launch result                               | `compose-desktop-workbench-scenes` owns exact Window/Workbench/slot transition                          | Agent runtime owning Window layout or Desktop repeating first-submit policy            |
| Character interaction              | Agent only owns the typed consumer contract and owner-qualified unavailable result            | A follow-on Chara change owns CharacterVersion/CharacterRun, published catalog, context and visible UI  | Fabricated Character facts, encoded slash text, or a Character-specific Agent loop     |
| World interaction                  | World owns Run/participant/view/action/event/state; Agent owns model sessions and role scopes | `define-ai-native-interactive-world` owns World product/runtime qualification                           | Fake World target, model-only World success or Agent committing World state            |
| `@` `/` `$` catalog                | `agent-input-capability-catalog` / Agent application                                          | `clarify-desktop-capability-catalog` owns installation and portable Skill/plugin provenance             | Management catalog acting as executable catalog or Renderer name lookup                |
| Model and generation configuration | `agent-configuration-policy` / Agent config and Generation owners                             | World/Chara may declare exact constraints; Evaluation observes effective receipts                       | Domain or Desktop silently overriding provider/model or creating hidden Agent sessions |
| Behavioral evidence                | `scripts/agent-eval` indexed suites and visible Desktop acceptance                            | `add-desktop-agent-evaluation-matrix` owns driver, facts, assertions and reporting                      | Mock/direct runtime results or final text claimed as canonical path evidence           |

## Goals / Non-Goals

**Goals:**

- 用一个 canonical Launch Draft application model 支持未绑定 Entry 和从领域直接发起的 bound Draft。
- 将 presentation phase、domain binding、Conversation owner、execution state 和 configuration policy 建模为正交状态。
- 让 Entry 与 Session 使用同一 input catalog 和 typed invocation contract，并支持 Builtin/Personal/Project/Plugin Skill 与 builtin/CommandHost/plugin command 的精确来源。
- 在首次提交时原子验证目标、授权、配置、input invocation、Conversation/领域 runtime materialization 和 Scene handoff。
- 支持同一 Conversation 在 Turn 间切换合法模型与参数，同时保持 transcript、context 和 owner 不变。
- 为 Character 和未来 World 提供可选 typed binding/context 扩展边界；owner 未实现时保持 unavailable，不建立第二套 Agent runtime。
- 对旧记录、失效 binding、不可执行模型和 session-only command 保持 fail-visible、fail-local。

**Non-Goals:**

- 不在本变更中实现 World domain、World authoring、World runtime 或虚构 World catalog 数据。
- 不在本变更中实现或组合 CharacterProject、published CharacterVersion、CharacterRun、Character Scene、角色回复或 Character Evaluation；这些属于后续 Chara change。
- 不把 Assistant、Workspace、Character、World 压成一个拥有领域事实的通用 Agent entity。
- 不把所有图片/视频/音频生成强制包装为聊天，也不建立独立 generation AgentSession。
- 不迁移、猜测或覆盖无法解析的现有 Conversation owner/context，不读取 active/current/recent Project 代替缺失身份。
- 不重新设计 Skills、Tools、MCP、Character memory、World state 或 GenerationJob 自身的领域 contract。
- 不保留旧 Entry 原始文本首发、角色特殊文本或 project fallback 作为兼容路径。

## Decisions

### First-submit title is an Agent-owned persisted fact

The Agent application derives a bounded deterministic title from the already validated typed first
input and supplies it to the canonical Conversation Session materialization port. Message text is
used directly after whitespace normalization; command and Skill inputs retain their `/command` or
`$skill` identity and optional arguments. The Pi catalog persists that title in the same creation
path that materializes the Conversation and then invalidates the Home projection.

This path does not invoke a model, infer locale from Renderer presentation, translate stored user
content, or replace the catalog title during projection. A Chinese first input therefore remains a
Chinese persisted title, while command/Skill-only first inputs never expose the former English
`New conversation` placeholder. Renderer tab-title projection may remain an immediate disposable
presentation update, but it is not a second persistence authority.

Primary navigation uses one 11px inherited typography contract for Project headers, standalone
Assistant/Workspace group headers, Conversation rows and expand/collapse list controls. Section
headings remain the distinct 10px catalog hierarchy.

### Invalid persisted Conversation lifecycle is isolated at bootstrap

The Agent lifecycle repository keeps one strict canonical decoder and does not synthesize newly
required fields for records written with an obsolete shape. Desktop bootstrap catches only the
typed lifecycle/context decode failure for the exact requested Conversation and returns a distinct
conversation-unavailable projection. The record remains durable and visible; no migration,
rewrite, delete, alternate lifecycle reader or empty-value compatibility path is introduced.

The Renderer presents that projection inside the owning Agent Surface without mounting an Agent
runtime connection. Window Shell, Workspace Main, navigation and valid sibling Conversations stay
available. Trust-boundary, sender, Scene and identity mismatches continue to throw and are not
converted into presentation diagnostics.

| 层   | 失效记录恢复结论                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent lifecycle repository 严格判定 canonical record；Desktop 仅把精确 decode failure 投影为 Surface unavailable；Renderer 仅展示。 |
| 依赖 | Renderer 不读取 SQLite；Desktop 不解释或重写旧 payload；Agent codec 不依赖 Electron。                                               |
| 接口 | Bootstrap unavailable diagnostic 增加唯一 conversation-invalid discriminator，不新增内部版本或第二读取路径。                        |
| 扩展 | 其他 bootstrap 错误仍保持原 fail-closed 语义；只有明确 lifecycle/context decode operation 可局部收敛。                              |
| 测试 | 覆盖旧字段、缺失新字段、合法 sibling、IPC typed result、局部 UI 和无自动改写。                                                      |

### 1. Agent phase 与领域 binding 正交

Agent application 投影一个 canonical Draft：

```ts
type AgentLaunchPhase = 'draft' | 'session';

type AgentLaunchBinding =
  | { kind: 'unbound'; draftId: string }
  | { kind: 'assistant'; assistantSpaceId: string }
  | { kind: 'workspace'; workspaceId: string; workspaceGrantId: string }
  | { kind: 'character'; characterId: string; characterVersionId: string; bindingReceiptId: string }
  | { kind: 'world'; worldExperienceVersionId: string; bindingReceiptId: string };
```

这里的 CharacterVersion/WorldExperienceVersion 是用户管理的领域版本事实，不是内部 schema generation。实际 contract 可以使用 owning package 已定义的最小 ref，但必须保留上述身份语义。

`AgentLaunchDraftProjection` 组合 `draftId`、binding、input catalog、configuration policy、非 authoritative draft snapshot 和 diagnostics。`AgentRootPresentation` 只决定 Draft/Session chrome 与 exact identity，不再自行推断能力。execution state 独立属于 exact Conversation/Turn，不能决定 owner 或 catalog source。

未采用单一 `agentMode`，因为 `entry/workspace/roleplay/world/running` 分别描述 phase、owner、interaction 和 execution；压成枚举必然产生组合爆炸与非法切换。

### 2. Entry 与领域入口都创建 Draft，不创建空 Conversation

Agent-only Entry 创建新的 unbound Draft。用户可以编辑输入、授权资源、选择模型、查询 scope-neutral catalog，并选择一个 exact target receipt。选择 Workspace/Character/World 只更新当前 Draft binding；不会创建 Conversation、启动 provider turn 或读取 active Project。

用户不选择 target 时，首次提交由 Agent application 通过显式 Entry owner port 物化产品配置的默认 Assistant binding；这不是 Renderer 默认值、active Project fallback 或无 owner Session。输入框不为 `/`、`$` 或“开始对话”保留重复按钮，用户直接输入触发符发现当前 Draft catalog。未绑定 Draft 的 `@` 只消费 scope-neutral/显式授权项，不调用 Workspace mention search。

从 Workspace 或 Assistant Surface 发起“新会话”时，Host 使用发起 owner 提供的 exact identity 创建 bound Draft。目标字段固定，但 composer、catalog、配置和首次提交仍走同一 Agent Root/application path。未来 Character 或 World Surface 必须消费相同入口，但只有其 authoritative owner 在后续 change 中可用后才能注册成功路径。用户可见的“打开项目”与“把项目作为下一会话上下文”是两个 typed intent：前者只做 Window Scene 导航，后者只更新 Draft binding，不能由同一个隐式副作用同时完成。

未采用每个领域一套 composer/controller，因为这些组件不拥有领域事实，而且重复实现会再次造成 command、Skill、配置和错误状态漂移。

### 3. Launch connection 与 selected binding 分离

Launch connection 只证明 application/window/workbench/surface/view/draft/sender 的连接身份。selected binding 是 Agent launch application authority 保存的状态，并携带 sender-bound、draft-bound 的 target receipt 或 grant。Renderer snapshot 只能保存可丢弃的 receipt reference、label、输入与展示配置；不能成为 Workspace/Character/World authority。

Workspace `@` 搜索通过 exact `draftId + connectionId + binding receipt` 请求 Workspace content port。切换 target 后，旧 receipt、搜索结果、Project Skills 和 pending query 立即失效。未知、跨 Window、跨 Draft 或已消费 receipt 只拒绝当前请求。Session 搜索始终通过 exact Conversation context，不接受 active/current Project。

Workspace 普通目录与 linked Media Library 是两个明确的 discovery owner。Agent 的普通目录 walker
不跟随 symlink；Assets Node 通过既有 Media Library link authority 和 content-tree guard 搜索
`neko/assets/<libraryName>/...`，再由组合时注入的窄 mention contributor 返回 portable locator。
Entry bound Draft 与 Session 复用同一个 contributor，Desktop 不遍历物理 library target，也不把
Resource Browser presentation identity 作为 Agent reference identity。

未采用“选择 Workspace 后重建另一套 Root/connection”，因为 target 选择不是 Scene transition；重建会丢失 Draft snapshot并扩大 connection lifecycle 竞态。

### 4. 领域 owner 提供 binding/context port

`@neko/agent-runtime/application` 定义窄的 host-neutral协作 port；Desktop 显式组合已实现 provider，不建立动态 wildcard registry：

- Assistant provider 解析 AssistantSpace 与显式 resource grants。
- Workspace provider 验证 Workspace identity/grant，并提供有界文件、实体、Project Skill/command artifact 目录。
- 可选 Chara provider 在后续 change 中从 exact CharacterVersion 解析或创建 CharacterRun binding，并提供角色公开设定、知识边界、memory view 和角色 interaction policy；本变更只定义 Agent consumer port，未组合时返回 owner-qualified unavailable。
- 未来 `@neko/world/application` 从 exact WorldExperienceVersion/WorldRun/participant/stance 提供 participant-scoped WorldView 与 required realtime capability；World 仍是 action/event/state commit authority。

领域 context 使用引用、检索 port 和有界 read model，不把整个目录、Character database 或 World state 一次性复制进 prompt。provider 缺失、identity 无效或 context 不可读时，Draft/Conversation 在自身边界显示 diagnostic，其他 owner 和会话继续可用。

未来 Character Entry target 与 Character Surface 只能消费 Chara-owned published-version catalog。普通 Entity、candidate 或 authoring-test snapshot 不得进入 Agent target catalog；在 Chara publish transaction、CharacterRun owner 和 Desktop composition 完成前，当前产品不注册 Character 成功入口，也不由 Agent 或 fixture 伪造对应事实。

World 未实现期间，其 target 只能由 World owner-qualified unavailable projection 表达；Agent Entry 不展示可成功提交的假 World 项。

### 5. 首次输入使用 typed invocation

Draft submit 不再只有 `messageText`，而是携带 canonical input intent：普通 message、command invocation 或 Skill invocation，并单独携带 mention/reference receipts。UI 文本只是显示与编辑载体，提交前必须用当前 catalog 将 trigger 解析为 exact entry identity。

首次提交 application transaction：

1. 验证 connection、draft、binding receipt、input catalog identity、resource grants 与 configuration request；
2. 让 owning domain provider验证并物化 exact owner context/Run attachment；
3. 原子写入 Conversation context、owner、initial user input 或 invocation intent 以及 durable pending Turn；
4. 幂等物化同一 AgentSession/Conversation；
5. attachment 可用后提交 exact Scene handoff；
6. 使用同一 Turn identity 启动 provider execution。

本地 commit 后 provider 失败时保留 Conversation 与 fail-visible Turn；不得回滚到 Draft、改用另一 owner/model/provider 或重复首条输入。Draft validation 失败时不创建部分 Conversation/Run/授权绑定。

### 6. 一个 input catalog 服务 Draft 与 Session

复用 `AgentInputCatalogEntry` 作为 canonical entry shape，并增加：

- `phaseRequirement`: Draft、Session 或两者；
- `bindingRequirement`: scope-neutral 或精确 Assistant/Workspace/Character/World；
- 完整 source identity：builtin、personal、project、plugin、command artifact 及其 Host provenance；
- `availability`: available 或带稳定 diagnostic 的 unavailable；
- 可执行 typed target identity，避免仅按显示名称重新查找。

Builtin command、personal/project command artifact、Builtin/Personal/Project/Plugin Skill 和 mention contributor 由 Agent application service逐项组合。单项无效只产生该项 diagnostic，不清空 sibling catalog。相同名称按现有精确 Skill source precedence 和 command identity 规则解析；禁止 first-compatible、失败后 try-next 或名字回退。

`/compact` 是 Session-only command，只操作 exact Conversation context；Draft 中不展示为可执行项，直接输入时返回 `session-required`，不得创建 provider turn。`@` 是 typed reference selection，不是文本替换；引用所属 owner 与当前 binding 不一致时拒绝当前引用。

### 7. 配置策略区分发现、可用、可编辑和生效

模型 catalog entry 只有在 provider/model 存在且所需 context window、output token、credential/capability metadata 可解析时才标记 available；否则保留可诊断的 disabled entry，不能让发送后才发现模型不可运行。

Draft/Conversation 投影每个配置维度的 effective value、source 和 field policy：`editable`、`locked` 或 `unavailable`，锁定和不可用必须携带 owning policy 与用户可读原因。Domain policy 可以锁定 interaction profile、purpose binding 或特定模型约束，但不能静默覆盖用户请求。

Draft 配置是创建下一 Conversation 的非 authoritative request。Conversation 创建后拥有 mutable future-turn configuration；每个 Turn 开始时从 exact Conversation config 创建不可变 snapshot。运行中修改只影响后续 Turn，不改变当前 Turn、历史 transcript、context、owner 或 queue。

同一 Conversation 可以在 domain policy 允许时切换 LLM provider/model/temperature/thinking 等参数。切换 Workspace、Character 或 World binding 会改变 owner，因此必须创建新 Draft/Conversation，不能原地 rebind。

### 8. Generation 是领域操作，不是 Agent 状态

图片、视频、音频生成保持由 Generation owning package 和 GenerationJob lifecycle 管理。用户在明确的生成 UI 中直接提交 typed generation operation 时，不需要先创建聊天 Conversation；用户通过自然语言请求生成时，唯一 AgentSession 通过 typed Tool/Job port 调用同一 Generation application service。

两条入口共享 purpose-qualified model catalog、配置验证、Job identity 和产物投影，但不是两条业务成功路径：它们是两个明确的用户意图，最终调用同一 Generation owner。不得创建隐藏 generation Agent、把 media model 当聊天 owner，或让 Agent 失败后隐式改走 direct generation。

共享 Workspace Generation application runtime、Host 单一配置 authority、Canvas/Agent port 注入与
direct-operation bridge 由 `extract-generation-domain-package` 实施；本变更的 6.7 在该 prerequisite
通过路径级验证后消费其结果，不在 Agent 内建立临时 coordinator、兼容 dispatcher 或第二事实来源。

### 9. Desktop 保持薄组合根

| Owner / package role                      | Canonical public entry/path        | Producer                                         | Consumer                                 | Runtime boundary                | Replaced path                                                   | User-data impact                                             |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `@neko/agent-contracts` L0                | package root `src/index.ts`        | strict codecs/types                              | Agent runtime/Webview/Desktop bridge     | cross-runtime typed contract    | 分裂的 launch/input/context shapes                              | 无数据写入                                                   |
| `@neko/agent-runtime` application         | `@neko/agent-runtime/application`  | launch/binding/catalog/config/lifecycle services | Desktop Main adapter                     | host-neutral Node application   | renderer target推断、Entry raw submit、current Project fallback | 只新增 canonical Conversation owner/context 写入；无猜测迁移 |
| `@neko/agent-webview` L2                  | package Root/composer public entry | typed UI intent                                  | Agent application bridge                 | sandboxed Renderer              | presentation boolean 菜单禁用、角色文本命令                     | Draft snapshot 局部重置，领域事实不变                        |
| future `@neko/chara` application          | follow-on Chara public entry       | Character binding/context projection             | Agent runtime port                       | host-neutral domain/application | Agent Webview 特殊角色启动字符串                                | 本变更不创建 CharacterVersion/Run                            |
| future `@neko/world` application          | package public application entry   | World binding/participant view/action result     | Agent role adapter/Desktop World Surface | host-neutral domain/application | 假 World Agent mode                                             | 本变更不创建 World 数据                                      |
| Desktop Main/preload/renderer composition | app package-private adapters       | sender/path/grant/Scene projection               | package Roots/public services            | Electron trust/UI boundary      | app-owned policy和 active Project lookup                        | opaque grants 继续受 sender/window 约束                      |

保留在 `apps/neko-desktop` 的逻辑仅限 Electron sender/webContents/window identity、native picker、opaque path grant、IPC decode/encode、Scene transition wiring 和 package service lifecycle，因为这些行为真实依赖 Electron Application boundary。catalog policy、binding resolution、domain context、配置合并和首次提交事务均可脱离 Electron 测试，必须位于 owning package。

### 10. 现有变更通过原子 contract 收敛

实施时同步修订重叠 OpenSpec：

- `compose-desktop-workbench-scenes` 保留 Window/Scene composition，但将 Agent Draft/binding/input/config 的 ownership 引用本变更，不再声明未实现 Character/Room 成功路径，也删除与生产行为不符的 verification。
- `define-character-chatroom-play-use` 保留 Chara/Room 领域 lifecycle，使用 typed Character binding port，删除特殊文本入口。
- `define-ai-native-interactive-world` 保留 World state/Run/AI role 设计，只在 World owner可用后贡献 binding；不新增 World-specific Agent runtime。
- `clarify-desktop-capability-catalog` 保留 extension/Skill installation authority，向 unified input catalog 提供精确 source receipt。
- `add-desktop-agent-evaluation-matrix` 增加 Launch Draft complete-session、binding isolation、typed Skill/command、模型切换和 compaction continuity case。

所有 producer、consumer、fixture、test 和 export 一次性切换到 canonical shape。旧 contract、handler、特殊文本和 fallback 路径删除或 poison；不增加 feature flag、dual-read、dual-write 或内部版本字段。

### 11. 内容引用和可见运行终态使用各自 authoritative projection

Desktop reference resolver 只验证 exact Workspace binding/grant、引用 receipt 与
`ContentLocator`，并返回授权后的 locator projection；它不读取或分类内容，不维护扩展名白名单，也不决定
模型、Tool 或转换路径。Agent workspace owner 使用既有 `AgentContentAccessRuntime` 和运行时 capability
catalog 为每个引用形成一个确定性处理计划：

- 有界纯文本通过统一 content read service 读取并以严格 UTF-8 注入当前 Turn；
- `.txt`、Markdown、Fountain、JSON、YAML、HTML 等文本型格式即使也被 document reader
  声明支持，仍由统一 content read service 直接读取；格式能力不能把可安全读取的纯文本改走 Tool；
- PDF、DOC/DOCX、PPT/PPTX、EPUB、CBZ/CBR、XLS/XLSX、FDX 等结构化或二进制文档只在
  provider prompt 中投影原始 `ContentLocator`，由既有 `ReadDocument` 读取；
- 文档内部图片只能使用 `ReadDocument.imageInfo` 返回的 locator，再交给 `ReadImage`；
- 图片在 exact selected `agent.main` 支持 image input 时可在 provider boundary 有界物化为原生输入；当
  当前模型不能直接读取像素时，只有 exact Turn policy 已绑定并实际注册的图片感知 capability 才可处理；
- 音频、视频和其他二进制只能使用当前运行时实际注册的对应感知、转录、抽帧或通用转换 capability。

处理计划在 provider execution 前由 exact reference media type、content owner 支持声明、模型 policy 和实际
capability registration 唯一确定。不得先尝试原生输入再隐式切换 Tool，不得切换 provider/source，不得把
二进制当文本，也不得回退到 raw path、旧 InputProcessor 或 Desktop 专用 reader。消息、transcript、UI
projection 和 Desktop contract 始终只持久化 locator，不携带 raw path、base64 或抽取内容。Pi transcript
使用同一 Turn 内的结构化 presentation entry 保存原始用户正文与 locator-backed reference metadata；
provider 使用的增强 prompt 不得被再次投影为另一条用户消息，也不得把 `Attached Context`、
`ContentLocator` 或临时抽取文本显示在用户正文中。缺少所需能力、
读取越界、MIME 不一致、非法格式或转换失败只拒绝当前引用/Turn并返回明确 diagnostic，不能升级为全局
应用错误或阻止 sibling Conversation、Workspace 与 Window Shell 渲染。

Conversation projection 是 Turn 内容和 terminal completion 的 authoritative read model；
`AgentStateSnapshot` 只是运行中活动提示。最后一个用户输入之后已经存在同一 Turn 的非 streaming
Assistant 最终响应时，Webview 不再渲染通用“正在处理”，即使较旧的瞬态 state snapshot 尚未被清理。
未完成的 streaming text、pending Tool、queue 或没有任何 canonical 输出的运行仍显示活动状态。该投影规则
不取消 runtime、不修改 queue、不伪造 idle，也不影响后台任务保护。

### 12. Persisted Workspace Draft 只在 exact attach 边界恢复进程级 grant

Workspace grant 是 Desktop Main 信任边界内的进程级 authority，不是可持久化的 Workspace 或
Conversation 事实。Window Scene 可以持久化其 opaque identity 与 exact Workspace identity，但应用重启后
新的 grant authority 必须在该 Draft 首次 attach 时调用 canonical `restore(windowId,
workspaceGrantId, workspaceId)` 重建同一 identity。该调用发生在 Main 已校验 exact Window、Workbench、
Agent Surface、View、Draft 和 binding 的 attach 边界；已有 grant 走同一方法完成 owner 校验，不增加
startup/attach 双路径，也不生成替代 grant。

恢复失败只返回 owner-qualified Agent launch unavailable projection，不抛成全局 IPC rejection，不修改
Scene、Project、Workspace 或 Draft 的 authoritative identity，也不读取 active/current/recent Workspace。
Renderer 在当前 Agent Surface 内显示国际化诊断和显式重试入口；未知异步 bootstrap 错误同样局部显示，
不得泄露 raw IPC 文本、绝对路径或 opaque grant identity。没有可用 runtime adapter 时不得伪造可操作的
Agent Root 或 no-op 成功，但 Window Shell、Workspace Main、Canvas 和 sibling Surface 必须继续渲染。

### 13. Pi 文档 range 与图片结果使用 Workspace 内容 authority

`ReadDocument` 的 model-visible contract 只接受 `range: { locator, endLocator?, limit? }`。Tool 顶层
拒绝未声明字段，schema 与失败诊断都明确禁止顶层 `locator`，而不是在执行期把错误 shape 解释成另一条
成功路径。内容 runtime 继续消费 package-owned `DocumentRange`；Pi bridge 不重写模型参数，也不增加
旧 shape alias。

`ReadImage` 成功后返回的图片 attachment 必须由同一 Workspace runtime 已持有的
`AgentContentAccessRuntime` 物化为 provider-bound image content。Workspace runtime 在创建 Tool snapshot
时始终组合这一 loader；Desktop 不注入文件 reader、Workspace root 或第二套图片 transport。loader 只按
attachment 的 exact `contentLocator` 或 `representationLocator` 读取、验证和有界标准化，批量图片复用
既有 contact-sheet transport，并保持 source index 顺序。缺失 locator、内容读取失败、MIME 非图片或预算
越界继续让当前 Tool/Turn fail-visible，不得改读 `uri`、raw path、cache path 或另一 source。

| 层   | 结论                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Content Tool 拥有参数 schema；Agent Workspace application 拥有 Tool-result loader composition；Pi 只适配结果；Desktop 不拥有内容处理。 |
| 依赖 | loader 依赖 host-neutral `AgentContentAccessRuntime` 与既有 provider image transport，不依赖 Electron。                                |
| 接口 | `ReadDocument` 保持一个 strict range shape；`PerceptualAssetRef` 可携带 exact representation locator，不新增内部版本或别名。           |
| 扩展 | 单图、批量图、Workspace/document-entry/generated-output 与 representation 共用同一 loader。                                            |
| 测试 | 覆盖错误顶层 locator、正确 range、生产 Workspace Tool snapshot、content/representation 物化、批量顺序和无 loader fallback。            |

Agent Evaluation disposition 为 `reuse`：`agent-runtime.stream-delivery/document-image-native-delivery`
已经声明 `ReadDocument -> ReadImage -> native Pi continuation` 与禁止 raw entry/cache/source 重建；本修复更新
确定性 application/bridge evidence，真实 visible/hidden provider 运行继续受任务 11.7 的显式成本授权约束。

### 14. 模型内容协议使用短引用，locator 只属于数据面

`ContentLocator` 继续是 Host 与领域之间唯一 canonical 持久内容身份，但不再作为模型需要复制和构造的
Tool 参数。Agent application 为 exact Conversation 建立可重建的 reference binding，并在每个 Turn 开始时
把已授权输入绑定为短 `input_ref`。`ReadDocument` 返回的语义单元、游标和图片分别绑定为
`unit_ref`、`cursor_ref` 和 `image_ref`；模型只能把这些字符串原样传回 Tool。

```text
authorized ContentLocator / DocumentLocator / cursor / representation locator
  -> Conversation-scoped Agent reference binding
  -> input_ref / unit_ref / cursor_ref / image_ref
  -> model-visible Tool call
  -> exact Conversation/Turn binding resolution
  -> canonical Content/Document application service
```

这不是新的通用 `ResourceRef`，也不是第二种持久内容 identity。短引用只属于 Agent 协议面；Tool result
对模型投影短引用、label、摘要和有界正文，对 Pi 持久 details 保留 canonical locator 与引用绑定，重开时
从 authoritative input metadata 和 Tool result details 重建。compact 只保留短引用、label、摘要和必要的
产品引用，不保留 base64、整本文档或大块提取内容。未知、跨 Conversation、跨 owner 或已失效引用只失败
当前 Tool Call，并给出可纠正 diagnostic；不得冒泡到 Window Shell 或其他 Conversation。

模型可见接口保持小而稳定：

- `ReadDocument` 使用 `input_ref` 与 `content | manifest | range | next`；range 使用 `unit_ref`，next 使用
  `cursor_ref`，模型不传 ContentLocator、DocumentLocator、fingerprint 或 cursor object；
- `ReadImage` 只接收 `image_refs`、固定分析意图和最多五张图片；模型不传 entryPath、MIME、尺寸、
  ContentLocator 或 representation locator；
- 基本 `Read`/`Write` 继续只接收 Workspace-relative path、文本和必要的简单并发引用；它们处理纯文本，
  不承担 Office、电子书、漫画、媒体或未知二进制解析。

格式路由由 exact MIME/格式、模型输入能力和冻结的 Turn capability snapshot 一次确定：

| 输入                                            | canonical route                                                                                                     | 模型上下文约束                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| UTF-8 文本、Markdown、Fountain、JSON、YAML、CSV | 基本 Read/Write                                                                                                     | 有界文本，不调用文档 reader                                            |
| 普通图片                                        | 原生视觉模型直接接收 Pi `ImageContent`；否则调用已绑定 `image.understand` Tool                                      | 无已绑定视觉能力时明确 unavailable                                     |
| PDF、EPUB、DOCX、CBZ 等结构化文档               | `ReadDocument(input_ref)`，需要像素时使用其 `image_ref` 调 `ReadImage`                                              | Host 选择 overview/detail、缩放或 contact sheet；单次源图片不超过 5 张 |
| 音频/视频                                       | 已注册的本地 metadata、waveform、抽帧、OCR、shot detection 或转录 Tool；需要语义感知时使用已绑定 purpose model Tool | 不把原始媒体或大量帧直接内联；不隐式切换 provider                      |
| MIDI/MusicXML                                   | 精确乐谱 parser/capability 生成结构化、有界摘要                                                                     | capability 未注册时明确 unavailable                                    |
| ZIP 等通用压缩包                                | 精确 archive processor 返回受限 entry catalog，再把文本/图片条目绑定为短引用                                        | 不递归解包、不尝试多个 processor、不暴露物理路径                       |
| 可执行文件、设备文件和未知原生二进制            | 当前 unsupported                                                                                                    | 未来 Computer Use 或隔离 processor 使用独立 OpenSpec                   |

文档图片不逐批询问用户“如何读取”。本地、只读、低成本且在既有授权内的筛选、压缩、overview 与
detail 读取自动执行；只有网络处理、专用付费模型、显著 token/cost、扩大授权范围或用户代码执行才进入
审批。该权限模型先记录到 Agent 沙箱 ADR，本变更不修改当前 permission runtime。

### 15. Workspace 目录发现复用现有内容引用协议

`ListDirectory` 是 Core Workspace file Tool，不是 shell `ls`、Desktop 文件浏览器或第二套内容 runtime。
模型只传 Workspace-relative directory path；`.` 表示根目录。Tool 默认只枚举一层并返回有界、稳定排序的
结构化条目，内部 details 为每个授权普通文件保留 `workspace-file ContentLocator`。目录、symlink、受保护
项目文件和普通内容文件保持不同 kind，不把显示名称重新解释为 authority。

Pi model protocol 复用既有 Conversation binding 投影目录结果：UTF-8 文本条目暴露
`workspace_path` 并继续调用基本 `Read`，结构化文档暴露 `input_ref`，图片暴露 `image_ref`，音视频暴露
带精确类别的 `input_ref` 供当前 Turn 已注册 capability 使用。`.nkc/.otio` 只投影 owning-domain route；
乐谱、压缩包、可执行文件和未知二进制在缺少精确 processor 时投影 unavailable，不签发可误用的基础文本
路径。`ContentLocator` 只保存在 Tool details，重开时由同一 generic Tool-result restoration 重建引用。

基本 `Read` 同步收敛为严格、有界的 UTF-8 文本读取：已知文档、图片、音视频、乐谱、压缩包、受保护
项目与可执行格式在读取 bytes 前拒绝，未知扩展只在有界读取后通过 fatal UTF-8 与 NUL 检查才成功。
它不得把 replacement character、部分二进制或超过预算的内容伪装成文本。目录或条目失败只失败当前
Tool Call；合法 sibling 条目仍在同一页结果中可用。

| 层   | 结论                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 职责 | Core Tool 拥有授权枚举与严格文本 read；Agent application 拥有格式路由和模型投影；Content/Media 提供 canonical 格式与 MIME 判断；Desktop 不参与。 |
| 依赖 | `@neko/agent-runtime` 只依赖既有 Content/Media public API 和注入的 Workspace policy，不依赖 Electron、Renderer 或 shell。                        |
| 接口 | `ListDirectory(path)` 与 `Read(file_path)` 使用 Workspace-relative path；locator 仅存在于内部 Tool details，短引用仍限定 exact Conversation。    |
| 扩展 | 新格式只扩展一个 canonical 分类与 exact capability route，不增加 reader priority、try-next 或 Desktop adapter。                                  |
| 测试 | 覆盖文本、EPUB、图片、媒体、受保护项目、未知二进制、稳定边界、symlink、绝对路径不投影、reopen binding 和 sibling isolation。                     |

Agent Evaluation disposition 为 `create`：现有文档附件和搜索案例没有证明模型先通过目录发现再进入唯一格式
route；新增一个 focused complete-session case，硬断言 `ListDirectory -> Read` 文本路径和
`ListDirectory -> ReadDocument` 结构化路径，并 poison shell、raw locator、absolute path 与 binary-as-text。

### 16. 图片感知 Tool 与 Prompt 消费同一 Turn 路由快照

`image.understand` 配置只表达 purpose model binding，不自动构成可调用能力。Agent Workspace runtime
注册一个 host-neutral `perception.image.understand` Tool；Pi bridge 仅在冻结的 Turn model policy 包含
有效 `image.understand` purpose use 时将其投影到模型 Tool snapshot。Tool 的 model-visible 参数只包含
Conversation-scoped `input_ref`/`image_ref` 短引用与有界 focus，`PiContentToolModelProtocol` 在 exact
Conversation 内解析为 canonical content 或 representation locator。Tool 通过既有
`AgentContentAccessRuntime` 有界读取并校验图片，使用 `ToolExecuteOptions.purposeModel` 调用冻结的精确
Pi purpose model，再向 `agent.main` 返回 `PerceptionEvidence`、usage 与 provider/model identity；结果不含
图片 payload、raw path、locator 或另一个 provider 选择参数。

每个 Turn 在 provider execution 前形成唯一图片路由：

```text
agent.main accepts image
  -> register ReadImage, omit perception.image.understand, use native Pi ImageContent

agent.main rejects image + exact Pi image.understand use + registered Tool
  -> omit ReadImage, register perception.image.understand, return structured text evidence

otherwise
  -> register neither image success path and fail the exact reference/Turn visibly
```

Tool snapshot、内容引用计划和 system Prompt 必须消费同一不可变路由结论。只有 external route 的最终
model-visible Tool snapshot 确实包含图片感知 Tool 时才添加外部感知指令；不得通过比较 chat/perception
配置 model id 推断 Tool 存在。`ReadImage` 不得为文本模型返回成功图片 attachment 后依赖 provider SDK
丢弃像素，也不得内部切换到 purpose model。purpose binding、内容读取或模型调用失败只失败当前 Tool
Call/Turn，不尝试另一 provider、模型、reader、source 或原生视觉路径。

| 层   | 结论                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent application 拥有 Turn 路由与 Prompt；感知 Tool 拥有图片理解请求和证据；Content runtime 拥有授权 bytes；Pi bridge 拥有 purpose model。 |
| 依赖 | Tool 依赖 host-neutral content port 与执行期 purpose model，不依赖 Electron、Renderer、配置文件或 Desktop path adapter。                    |
| 接口 | 模型只见短引用和 focus；内部准备参数携带 canonical locator；结果是结构化 `PerceptionEvidence`，不新增内部 contract 版本。                    |
| 扩展 | 后续媒体 purpose Tool 可复用“实际 Tool snapshot 驱动 Prompt”的原则，但本任务不建立通用媒体路由框架。                                      |
| 测试 | 覆盖 external/native/unavailable 三路、精确 purpose identity、短引用隔离、图片预算、无 `ReadImage` 文本路径和无 provider fallback。         |

Agent Evaluation disposition 为 `update`：扩充既有 `agent-runtime.perception-routing`。正例必须证明
DeepSeek-compatible `agent.main -> perception.image.understand -> exact image.understand purpose`；原生视觉
边界必须证明外部 Tool 缺席；缺失 purpose binding 边界必须证明 Tool 与相关 Prompt 均缺席并 fail-visible。
真实 visible Desktop 与 hidden complete-session provider 运行继续受任务 11.7 的显式成本授权约束。

### 17. Conversation 队列保存完整输入并串行处理中断

Agent Workspace application 是每个 Conversation 待执行 Turn 的唯一队列 owner。Webview 在当前 Turn
活动时继续提交与空闲发送相同的 canonical input request，包括文本、附件、context payload、文件引用、
typed command/Skill identity 和发送时选择的模型配置。队列项向 Renderer 只投影重建 Composer 所需的
安全 Draft presentation；运行所需的完整 immutable input 仍由 application 保存，不由 UI、Desktop 或
transcript 充当第二事实来源。

普通完成、失败或 provider 终止后，application 从同一 Conversation 队列释放下一项。用户显式停止当前
Turn 时，application 先暂停该 Conversation 的待处理队列，再取消 exact turn/run identity；停止不会清空、
编辑或自动执行队列项。用户对指定队列项执行“立即发送”时，application 原子提升该项、恢复队列，并在
存在当前 Turn 时取消当前 Turn；只有当前 Turn 达到 terminal 后才启动指定项，不允许同一 Conversation
并发执行两个 Turn。

删除只移除指定 pending item。编辑原子移除指定项并把其完整 Draft presentation 恢复到 owning Tab；若
Composer 已有未提交内容，则保留现有 Draft并显示局部冲突 diagnostic，不丢弃或覆盖任一组用户输入。
所有 queue action 必须绑定 exact Conversation 和 queue item identity；stale、cross-Conversation 或非用户
continuation item 失败当前操作，不能回退 active Conversation 或改变 sibling 队列。

| 层   | 结论                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent application 拥有完整 pending Turn、顺序、暂停和释放；Webview 拥有 Composer Draft；Desktop 只转发 typed queue intent。                         |
| 依赖 | Queue contract 位于 `@neko/agent-contracts`，application 不依赖 React/Electron，Renderer 不持有 runtime input authority。                            |
| 接口 | 复用唯一 queue snapshot，原子替换 `promote` 为 `send-now`；queue item 增加有界、可克隆的 Draft presentation，不增加内部版本或平行 handler。          |
| 扩展 | 普通 message 与会产生 Turn 的 typed Skill/command 共用同一 `startTurn` queue；不产生 Turn 的 Session command 仍由自身 operation contract 串行校验。 |
| 测试 | 覆盖中断暂停、正常 drain、富输入重建、删除、编辑冲突、指定项立即发送、stale/cross-Conversation 拒绝、Desktop route 和可见控制。                      |

Agent Evaluation disposition 为 `update`：扩充 `agent-runtime.workflow-controller` 的
`cancel-resume-recovery`，证明 queue submit、active cancel、paused pending、指定项 send-now、exact identity、
terminal idle 与无并发/无 active-Conversation fallback。可见 Desktop 验收必须通过真实 Composer 控件检查停止
按钮、运行中输入、富引用排队和队列操作；没有显式 provider 成本授权时记录为 infrastructure-blocked。

## Risks / Trade-offs

- [Character/World 成熟度不同导致 union 形同假能力] → provider 未实现时只投影 unavailable；任务按 Assistant/Workspace、Character、World 三阶段设 gate，后阶段不得阻塞前阶段正确性。
- [统一 catalog 使首发事务变复杂] → 先定义 strict typed input 与 availability，再用单一 application service 解析；Renderer 不参与执行路由。
- [Workspace target 可搜索但 Conversation 尚未创建，授权生命周期更复杂] → binding receipt 与 grant 同时绑定 exact connection/draft/sender，替换 target 或 detach 时显式释放。
- [模型参数锁定让用户误以为设置失效] → 每个字段投影 policy owner 和原因；非法 override 在 submit/next-turn boundary 明确拒绝。
- [旧 Conversation 缺少 canonical owner/context] → 保留原记录并显示局部 unavailable diagnostic；不修复、不默认 Assistant、不猜 current Project。
- [跨活跃 OpenSpec 的要求重复] → 实施第一阶段先完成 requirement ownership 对账，冲突未消除前不得修改生产代码。
- [真实 Agent 验收成本较高] → deterministic contract/application gates 先拒绝错误路径，再运行最小正向、边界和恢复案例；没有 complete-session driver 时如实记录 infrastructure-blocked。

## Migration Plan

1. 对账并更新重叠 OpenSpec requirement owner，冻结 canonical contract 名称和删除清单。
2. 在 `@neko/agent-contracts` 原子替换 Launch Draft、binding、input catalog、typed submit 与 configuration policy shape，更新全部 producer/consumer fixtures。
3. 在 `@neko/agent-runtime/application` 实现唯一 launch/binding/catalog/config/lifecycle service，并删除 active/current Project lookup。
4. 切换 Desktop bridge 与 Agent Webview 到 projection-driven composer；删除 Entry 菜单 gate、空 mention handler、raw command/Skill 首发和 renderer-local authority。
5. 接入 Assistant/Workspace provider并完成真实 Electron/Agent验收。
6. 删除角色特殊文本入口并保留 Chara typed consumer contract；真实 Chara provider、产品入口和 owner isolation 验证由后续 Chara change 完成。
7. World owner/runtime 可用后再接入 World provider；此前保持 unavailable。
8. 删除旧 export、handler、fixture 与测试 shortcut，运行完整质量门禁并记录未执行的 World/real-provider 风险。

本地未发布产品无需兼容部署回滚路径。代码回滚必须以整个 canonical contract 边界为单位恢复同一 revision；不得在生产代码保留新旧运行路径。用户记录始终保留，回滚或失败不能删除 Conversation、Character 或 Project facts。

## Open Questions

- World Entry 应只允许附着已有 WorldRun，还是允许从 WorldExperienceVersion 创建 Run；该决定由 `define-ai-native-interactive-world` 的 World product workflow 拥有，Agent 只消费最终 typed binding。
- 对 unavailable input catalog item，产品最终采用隐藏还是 disabled 展示；contract 必须始终保留 diagnostic，UI presentation 可在可用性测试后确定。
