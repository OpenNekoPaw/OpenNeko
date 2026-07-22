# ADR: 采用 Pi Agent、Skill/Session primitives 与工具专用模型边界

状态：Accepted
日期：2026-07-16
范围：`neko-agent`、OpenNeko Agent 提取、LLM/provider runtime、Skill、会话、生成与感知工具、多模型配置及异步任务边界。

## 背景

当前 `neko-agent` 同时拥有 ReAct/Think/Act 循环、Agent session/runner/stream、LLM
adapter、provider/model 配置、工具执行、Skill/Capability、权限审批、MCP、会话持久化、
创作任务和 Webview/Extension 投影。2026-07-16 的物理行数审计显示，排除 Webview、
Extension 和 TUI 后，`agent`、`platform`、`ai-sdk`、`agent-types` 仍约有 12.1 万行生产
TypeScript；其中只有一部分是 Neko 独有的创作产品职责。

Skill 和会话也存在同类职责膨胀。当前 `agent/src/skill` 约有 1.02 万行生产
TypeScript，相关共享 Skill 类型约 2741 行，`@neko/skills` 又包含约 1.69 万行生产代码；其中
混入 Tool/Capability、模型覆盖、生命周期 slot、冲突策略、领域 runtime、记忆、质量门禁和
validation。`agent/src/session` 与 `runtime/session` 合计约 1.34 万行生产 TypeScript，核心
`AgentSession` 同时拥有 Agent loop、prompt、Skill、Tool、permission、history、journal、memory、
compaction、validation、task observation 和 diagnostics。OpenNeko 不应把这些实现整体迁移。

OpenNeko 当前优先开发 Canvas、Timeline、Assets、Preview、生成与感知工具等外围创作能力，
不应继续自行维护通用 Agent loop 和多家 LLM 协议适配。外部
[`earendil-works/pi`](https://github.com/earendil-works/pi) 项目已经提供：

- `@earendil-works/pi-agent-core`：有状态 Agent loop、工具执行、流事件、取消、
  steering/follow-up queue、tool hooks、Skill loader、通用 Session、JSONL repo/storage 和
  context/compaction primitives；
- `@earendil-works/pi-ai`：多 provider/model 目录、凭据解析和统一 LLM 流式调用；
- 一个 Agent 实例当前持有一个活动主模型，但工具执行函数可以独立调用其他模型或外部服务。

本文中的 Pi 专指 `earendil-works/pi`，不是 Inflection 的对话产品 Pi。

## 决策

### 1. Pi 是 OpenNeko 唯一的主 Agent 和 LLM canonical path

OpenNeko 直接依赖：

```text
@earendil-works/pi-agent-core
@earendil-works/pi-ai
```

Pi 负责：

- 主模型调用和流式 provider 协议；
- Agent turn loop；
- tool call 参数校验、执行、结果回填和并发；
- Agent 事件流、取消、steering 和 follow-up queue；
- LLM provider/model 注册和凭据解析。

OpenNeko 不在 Pi 下方继续保留
`AgentExecutor -> IService -> Platform Service -> AdapterRegistry -> AI SDK` 平行路径，也不把
Pi 包装成现有 Platform adapter。迁移完成后，旧路径必须删除、poison 或显式隔离，不能作为
fallback 返回成功。

### 2. OpenNeko 保留产品 runtime，而不是第二套通用 Agent 内核

目标调用链是：

```text
VS Code / Webview
  -> OpenNeko product runtime
       -> conversation identity / permission / Capability / MCP / ResourceRef
       -> creative run / task / projection
       -> Pi Skill catalog + Pi Session transcript
       -> Pi Agent
            -> Pi main model
            -> OpenNeko tools
                 -> generation / perception model runtimes
```

OpenNeko 继续拥有：

| 职责                                                | 原因                                                  |
| --------------------------------------------------- | ----------------------------------------------------- |
| conversation、turn、run 和 task identity            | 这些身份连接 transcript、创作任务、取消和 UI 投影     |
| conversation catalog 与 branch metadata authority   | title、workspace、branch/session mapping 是产品事实   |
| Skill Host source、trust、enablement 和 fingerprint | Pi Skill 文件不能自行声明宿主信任与授权               |
| Capability、MCP 和工具目录                          | 它们表达真实可执行领域能力和宿主依赖                  |
| 权限、审批、workspace trust 和 ResourceRef          | 它们属于本地文件、VS Code 和用户数据边界              |
| Creative run/work item 和后台任务观察               | 长时间媒体生成必须可恢复、可取消、可追踪              |
| Canvas、Timeline、Assets、Markdown 和 Preview 接入  | 这些是 OpenNeko 的产品能力与 package-owned apply 边界 |
| VS Code Extension/Webview adapter                   | Pi 不拥有 Webview 沙箱、CSP、URI 授权和宿主生命周期   |

首个迁移版本同时覆盖 TUI、VS Code Extension 和 Webview。Webview 产品 UI、领域模型调用、SQLite
catalog 及其他 Pi 不支持的产品能力继续保留；保留条件是明确的产品职责，而不是为旧 Agent 路径提供
compatibility。

这些职责通过尽量少的小模块组合到 Pi；不得重新叠加 interface、factory、registry、provider、
adapter 和 facade 来复刻现有内核。

### 3. 直接采用 Pi Skill primitives，不迁移现有 Skill 控制面

OpenNeko 直接使用 `@earendil-works/pi-agent-core` 导出的 `Skill`、`loadSkills`、
`loadSourcedSkills`、`formatSkillInvocation` 和 system-prompt formatting。Pi Skill loader 是
canonical 的 `SKILL.md` 解析、发现和渐进披露路径；Builtin、project 和 personal Skill 使用同一
文件形态，不再由 TypeScript `Skill` 常量维护第二套定义。

Builtin Skill 内容保留在独立的 `@neko/skills` 内容包中，并在 Host 构建时复制到分发目录。
`@neko/agent` 的扩展面只拥有 Skill Host、发现、信任/启用过滤、locator、读取和执行边界；不得拥有
Canvas、Character、Puppet、Story、Quality 等领域能力实现、模型调用 adapter、执行编排或 UI 生命周期。
领域能力由 owning package 在 Agent 之外通过 Capability/Tool contract 注册；Agent 只消费宿主投影的
通用工具契约。Skill 内容包不得导出 TypeScript 业务 runtime。

Skill 只负责：

- 适用与不适用场景；
- 领域方法、创作判断、输出标准、示例和质量检查；
- 相对引用的 `references/`、`assets/` 和确有必要的确定性 `scripts/`；
- 缺少输入、证据或能力时的 fail-visible 指导。

Skill 不负责 Tool schema/注册、MCP 连接、权限、workspace trust、provider/model 路由、
conversation/session 状态、Run/Task、ResourceRef、项目 revision、可执行 workflow state 或自动
validator。Skill 可以描述工作方法和质量标准，但不能成为运行时控制器。

OpenNeko 只在 Pi Skill 外维护最小 Host record：

```ts
interface OpenNekoSkillRecord {
  readonly skill: Skill;
  readonly source: 'builtin' | 'project' | 'personal';
  readonly trusted: boolean;
  readonly enabled: boolean;
  readonly fingerprint: string;
}
```

Pi 的 `Skill.filePath` 是 formatter 和渐进披露使用的字符串定位信息，但真实宿主路径不得暴露给
模型。OpenNeko 在 Skill Host 中维护 process-local、fingerprint-addressed 的 `SkillLocator`，并只在
Pi adapter 边界编码为 POSIX 形态，例如 `/__neko_skills/<fingerprint>/SKILL.md`。locator 不承诺跨
session 稳定。Skill Host 负责把 locator 映射回受信 Skill 内容或宿主路径；Pi、模型和领域工具不得
绕过 Host 解析它。

`SkillLocator` 与现有路径、内容访问和透明缓存是不同命名空间：

| 形态                                   | 语义与 owner                                            | 持久性           |
| -------------------------------------- | ------------------------------------------------------- | ---------------- |
| workspace-relative `ContentLocator`    | Host Content I/O 拥有的稳定源定位                       | 可持久化         |
| document/generated/package locator     | 对应 source owner 的稳定内容身份；不是 cache 路径       | 可持久化         |
| representation locator                 | Host 派生服务返回的 opaque 可重建表现身份               | 仅按契约传递     |
| 物理 cache 路径、Webview URI、绝对路径 | Host/runtime 投影                                       | 不可写入项目事实 |
| `SkillLocator`                         | Skill Host 拥有的模型可见运行态定位符                   | 不可持久化       |

因此透明缓存不是虚拟路径，`${VAR}/path` 也不与 `SkillLocator` 共用 resolver。Skill 内容不得为了
适配 Pi 而进入 `ResourceCacheService`；`SkillLocator` 不得交给 `PathResolver`、workspace content reader 或
项目持久化。只有指定的 Agent content-read boundary 识别 `/__neko_skills/` namespace，并委托 Skill
Host 读取。Skill 包内 `references/`、`assets/`、`scripts/` 使用同一虚拟根下的相对
`SkillResourceLocator`，由程序执行规范化、包根 containment、trust 和权限检查；不建立通用 VFS、
通用 cache 或多层 path adapter。

普通 Agent 同时支持两条入口，并收敛到同一 Host record/fingerprint：

- 显式 `$skill-name`：Host 在 turn 开始前解析 project-first 的目标，检查 trusted/enabled，并通过 Pi
  `formatSkillInvocation` 直接加载完整正文；不让模型决定是否采用。
- 模型渐进披露：Pi system prompt 只列 name/description/虚拟 location，模型通过指定 content-read
  boundary 读取正文和相对资源；`disable-model-invocation` 的 Skill 不进入此目录，但仍可显式调用。

同名 Skill 采用 project source 优先；被遮蔽记录产生 warning 而不是让运行时崩溃或合并内容。Skill
文件 fingerprint 改变时，进行中的 turn 继续使用已捕获 snapshot，下一 turn 使用新 record；既有
conversation 不固定旧 fingerprint。

显式调用正文和模型通过 content-read 获得的 Skill 正文都是该 turn 的真实模型输入，因此按 Pi
message/tool-result 语义进入 Pi Session transcript，以保证 reopen、branch 和 context 忠实。只记录
实际送入模型的文本及 source/fingerprint receipt，不复制物理路径、二进制 asset 或 script 文件。
“turn-scoped”表示不保留 activation/lifecycle state，不表示删除历史 transcript 中已经发生的输入。

Skill Host 不建立独立 cache manager。Pi loader/Host catalog 当前进程持有的 fingerprint snapshot
就是唯一内存复用；文件变化使下一 turn 重载。Skill 内容不进入 `ResourceCacheService`，也不建立
持久 Skill cache。

首版不建立持久 `ActivateSkill`/`DeactivateSkill` 状态，不迁移 slot、owner、lifetime、conflict
resolver、Skill model override、ToolGuard/ToolSet mutation 或 lifecycle UI indicator。确有产品需求
的“固定 Skill”只能作为简单 conversation setting 后续引入，不能恢复通用 lifecycle engine。

Skill `scripts/` 允许执行，但 Skill 文件、metadata、source priority 或 trust record 都不能授予执行
权限。执行必须通过用户/工作区 permission policy 配置的 allow/ask/deny、workspace trust、现有
External Processor/PathAccessPolicy/sandbox 和 ResourceRef 输出边界；普通 Agent 不获得任意 shell。
授权至少绑定 workspace、Skill fingerprint 和具体 script/processor identity，fingerprint 改变后旧
授权失效。

`allowed-tools` 作为 Agent Skills 的实验字段可以解析和保留，但不作为 OpenNeko 权限权威，也不
扩大或收窄实际 Tool registry；权限与可用性由 Capability、Tool、approval 和 workspace trust
共同决定。首版不引入 `agents/neko.yaml`；出现第二个不可由标准 metadata/Host record 表达的真实
调用方后，再单独设计最小 overlay。

### 4. 采用 Pi Session primitives，OpenNeko 保留产品会话所有权

OpenNeko 使用 Pi `Session`、`JsonlSessionRepo`、`JsonlSessionStorage`、`buildContext` 和
compaction utilities 作为 transcript/context 的唯一 canonical path。OpenNeko 不迁移现有
`ConversationManager`、自研 Journal reader/writer/projection、重复 history hydration、自动压缩
和 `AgentSession` 持久化逻辑。

Conversation 是 OpenNeko 产品 aggregate，Pi Session 是某条 transcript branch 的运行时/持久化
载体，两者不是同一身份。领域关系是：

```text
Conversation
  -> default WorkspaceBinding
  -> one active ConversationBranch
       -> one Pi sessionId
       -> one active Pi Agent
  -> zero or more historical/alternative ConversationBranch

Attachment / Tool / ResourceRef grant
  -> may introduce additional authorized inputs
  -> does not replace the default WorkspaceBinding

Pi Session JSONL
  -> messages / model changes / active-tool changes / compaction / context

OpenNeko local metadata store
  -> conversation catalog / workspace binding / Run / Task / ResourceRef / permission facts

Diagnostic logs
  -> audit and troubleshooting only; never a second transcript authority
```

程序拥有用户级 session root 和 SQLite metadata root，并在其中按 `workspaceId`/conversation/branch
分区。TUI 与 VS Code 使用同一 program storage layout；工作区内只保留稳定 workspace identity 和
项目事实，不保存 Pi transcript。用户区数据丢失不提供恢复或从工作区反向重建。

同一 conversation 跨 TUI/VS Code 采用单写者语义。用户级 SQLite 保存最小
`ConversationExecutionLease`（conversation、holder、lease epoch、expiresAt）；只有持有当前 epoch
的 Host 可以创建/推进 Pi Agent turn 和提交 checkpoint，其他 Host 只读投影。显式接管必须取得更高
epoch；过期 holder 的迟到写入因 fencing mismatch 失败。lease 只协调真实跨进程共享资源，不拥有
Agent 状态，也不引入全局 active conversation。

Pi `cwd` 使用 Host 生成的运行态虚拟 workspace locator，例如
`/__neko_workspaces/<workspaceId>`。它只用于 Pi session partition/header，不是实际目录、
`${VAR}/path`、`SkillLocator` 或通用文件工具输入；程序通过 `workspaceId` 解析真实 workspace binding。

`conversationId`、`branchId` 和 Pi `sessionId` 必须显式映射，不能互相推导或复用。创建分支、从历史
节点继续或回退时，OpenNeko 创建/选择新的 `ConversationBranch` 与对应 Pi Session；一个
conversation 同时只有一个活动 Pi Agent，并绑定当前 active branch。Pi Session entry id 只标识
transcript tree entry，不替代 OpenNeko `turnId` 或 durable `runId`。
长时间生成、provider task id、恢复/取消和生成结果必须继续写入 OpenNeko Run/Task authority，
不得只存在 Pi `custom` entry。SQLite 不复制完整 transcript；它同时包含不可由 Pi 重建的产品
metadata authority 和可丢弃的列表 projection：

```text
Conversation metadata authority
  -> conversationId / defaultWorkspaceId / title / lifecycle
  -> activeBranchId / createdAt / updatedAt

ConversationBranch metadata authority
  -> branchId / conversationId / piSessionId
  -> parentBranchId? / forkEntryId? / createdAt / updatedAt

Rebuildable listing projection
  -> messageCount / preview / lastModel / lastActivity / compaction status
```

Pi Session header/JSONL 只拥有 `sessionId`、虚拟 `cwd`、Pi format/version、消息、model changes、
tool entries、compaction 和 context。它不复制 title、active branch、workspace binding、完整 model
policy、Run/Task/ResourceRef 或 permission facts。SQLite 丢失时允许 Pi JSONL 成为 orphan 并由 GC
清理，不要求扫描 Pi Session 重建 Conversation/Branch。

每个活动 conversation 拥有一个独立 Pi Agent、当前 branch 的 Pi Session、abort state 和 immutable
turn snapshot。
一个薄 adapter 把 Pi 事件投影到 OpenNeko UI，并在 turn terminal point 创建唯一的幂等
`TurnCheckpoint`，按 turn 写入该 turn 的有序 Pi entries。UI 可以先展示尚未持久化的完整结果，但
必须标记 `volatile`、`persisting`、`durable` 或 `persistence-delayed`；写入失败进入可重试补写队列，
不得显示为已持久化。补写队列只存在于当前进程内，graceful shutdown 做 best-effort flush；进程
退出或崩溃允许丢失仍未落盘的 turn，不增加 durable outbox、WAL authority 或第二套 journal。不得在
其外再叠加通用 session facade、第二套 message DTO 或 event sourcing runtime。

Pi primitives 是唯一 compaction engine 和 JSONL compaction entry owner；OpenNeko 保留最小
`CompactionPolicy`，只决定触发时机、预算和必须保留的产品引用约束。OpenNeko 不实现第二套
summary、context builder 或 compaction persistence。

### 5. 采用扁平的 purpose 到模型使用配置

单个 Pi Agent 在一个 turn snapshot 中只使用一个活动主模型。生成、感知和辅助模型不通过
切换 Pi Agent 的全局模型实现，而由工具执行边界按语义 purpose 解析。

模型配置不建立 `main -> purposes`、`media type -> operation` 或 default/type/purpose 多级结构。
`agent.main` 是必需的普通 purpose；所有 purpose 在同一映射中平铺，并携带完整模型引用和已解析
参数：

```ts
type ModelPurpose =
  | 'agent.main'
  | 'canvas.prompt'
  | 'canvas.judge'
  | 'character.dialogue'
  | 'character.profile'
  | 'text.embed'
  | 'image.generate'
  | 'image.edit'
  | 'image.understand'
  | 'video.generate'
  | 'video.understand'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.asr'
  | 'audio.understand';

interface ModelUseConfig {
  readonly model: ModelRef;
  readonly parameters: ModelParameters;
}

type ProductModelPolicy = Readonly<
  { 'agent.main': ModelUseConfig } & Partial<
    Record<Exclude<ModelPurpose, 'agent.main'>, ModelUseConfig>
  >
>;
```

`llm.chat` 表达模型 capability，不作为 purpose。模型目录默认参数、用户配置和 conversation
覆盖只在 turn/run snapshot 创建时按固定顺序归一化一次；执行期只消费最终扁平
`ProductModelPolicy`，不再运行继承、类型默认、首个兼容模型或主模型 fallback。同一个模型可以被
显式绑定到多个 purpose。首版只实现已有真实调用方的 purpose；Canvas prompt/judge、Character
dialogue/profile 与 embedding 已有保留调用方，因此分别使用 `canvas.prompt`、`canvas.judge`、
`character.dialogue`、`character.profile`、`text.embed` 五个同级 key。需要 planner、summarizer 或
subagent 模型时，仍必须先有真实调用方再增加新的平铺 key，不建立 model graph。

Pi 执行的产品文本 operation 只能调用一个接收已冻结 model-use 的纯 completion primitive；它不读取
配置、不选择模型、不拥有 history，也不 fallback。该 primitive 属于 Agent 之外的中立产品模型
runtime；Agent turn 只得到自身 `agent.main` 与工具所需绑定的不可变投影。Canvas 只暴露语义化
`generate(shotData) -> prompt` port；Canvas 代码不得接收 chat message、token 参数、provider/model、credential、Pi 对象或通用 LLM service。
Canvas-owned adapter 负责构造领域 prompt 契约，并由应用组合层注入中立 purpose runtime；该 adapter、
judge/apply 和 creative run 均不得进入 `@neko/agent`。Character 同样保留在自身 owning package 的窄领域
port。Pi 当前没有 embedding protocol 时，`text.embed` 由领域 runtime 执行，但同样必须消费冻结绑定，
不得继续依赖包含 chat 的 Platform `IService`。

TUI 与 VS Code 在 turn 边界读取同一 `default_model_purposes` 平铺配置并执行相同的
provider/model/enabled/capability/credential 校验；旧 `default_models.image|video|audio` 只服务仍待迁移的
产品设置展示或领域入口，不参与 Pi turn 的 purpose 推导，也不能作为缺失 purpose 的类型 fallback。
配置目录中的 `model.id` 与 provider wire model name 是两个显式身份：Pi 执行的 `agent.main` 和
`image.understand` 使用 wire identity 注册请求，领域执行的生成/edit/TTS purpose 保留配置
`model.id` 交给 owning runtime，并可附带 wire name 作为请求事实。两者不得互换，否则配置查找与实际
provider 请求会指向不同模型。

### 6. Pi 复用 Provider/Auth，OpenNeko 保留配置与凭据所有权

OpenNeko 不直接采用 Pi 的完整配置文件作为产品配置事实。OpenNeko 继续拥有用户/工作区配置
来源、扁平 purpose 绑定、conversation override、媒体领域配置和 snapshot 生命周期，只把 Pi 支持
的主模型 provider/model/auth 投影到 `@earendil-works/pi-ai` 的 `Models` 与 Provider。

NewAPI/OneAPI-compatible gateway 继续作为首版支持的产品配置与执行能力，但不继续拥有一条旧 Agent
调用链。用户配置的 `type = "newapi"`、endpoint、显式 protocol profile、模型 catalog 和 bearer
credential，以及 Neko 官方 account gateway 注入的 catalog/entitlement 都继续有效，并按用途拆分：

- `agent.main` 和有界的聊天/多模态理解请求，按显式 protocol profile 投影为 Pi
  OpenAI-compatible model/provider，使用配置的 `baseUrl`、credential、headers 和必要的 compatibility
  flags；不得调用旧 Platform `GenericAdapter` 或 Vercel AI SDK chat path；
- NewAPI 特有的图片、视频、语音、音乐 endpoint、参数映射和异步 task polling 继续由 OpenNeko
  media runtime 拥有。实现应从被删除的通用 `ai-sdk`/Platform chat 层迁到对应媒体 owner，不为保留
  NewAPI 而保留旧聊天抽象；
- Neko account 登录、catalog、entitlement 和 usage 是产品账号职责，继续由 OpenNeko Auth 拥有；解析
  后的 gateway credential 只通过共享 CredentialStore/Provider 投影进入请求路径，不进入 transcript、
  workspace、日志或工具参数。

NewAPI capability、endpoint、credential 或模型绑定缺失时必须 fail-visible；不得回退到其他 provider、
官方账号、主模型或旧 adapter。Pi 当前支持任意 OpenAI-compatible `baseUrl` 和兼容参数，因此 NewAPI
聊天不需要 OpenNeko 再维护一套通用 chat provider。

Pi 的 provider factory、模型目录、模型参数、认证解析、OAuth 登录/刷新/logout 生命周期和
`CredentialStore` 契约是 canonical path。OpenNeko 实现最小 persistence adapter 与
`AuthInteraction`，并明确拥有：

- credential 的持久化、删除、来源/provenance 和日志脱敏；
- VS Code/TUI 的登录、同意和错误交互；
- workspace/user policy 及 purpose 配置；
- Pi 未覆盖的媒体 provider 和异步任务认证边界。

TUI 与 VS Code 共享同一个程序级用户 CredentialStore；Host 只提供各自的 `AuthInteraction` 和 UI
投影，不形成 Host-local 登录 authority。credential value 不进入 workspace、conversation SQLite、
Pi Session、日志或 Evaluation facts；环境变量/用户配置等输入必须归一化到同一 provenance-aware
解析路径。

凭据投影按 provider identity 归属。CLI 显式 key 或无法识别 provider 的通用环境 key 只绑定当前
选择的 `agent.main` provider；不得扩散到其他 purpose provider。其他 provider 只能使用自身配置、
自身 provider/type 环境变量、账号 gateway 解析结果或共享 CredentialStore 中同 identity 的记录。
同一 provider 在一个 snapshot 中出现不一致 endpoint、auth profile 或 credential 时直接拒绝，不能
任选第一项。

Pi provider 拥有 provider-specific API key/token 解释、OAuth flow、token refresh 和已认证模型调用。
生产环境不得依赖 Pi 默认的内存 credential store，也不得在 OpenNeko 中复制一套 token refresh
framework。

首版只验收 Pi 内置 Provider OAuth 和实际使用的 Radius-compatible gateway `/v1/oauth` discovery。
任意 OAuth/OIDC 端点仍以 Pi 公开 `OAuthAuth` 作为未来扩展点，但没有真实 Provider 调用方前不实现、
不进入首版门禁。Pi 当前没有通用的数据配置式 `authorizationEndpoint`/`tokenEndpoint` factory，
不得宣称只写配置就支持任意 OAuth 端点，也不得为此建立重量级 OpenNeko Auth Platform。

### 7. 主 Agent 选择工具，runtime 选择具体模型

Canonical tool path 是：

```text
user request
  -> Pi main model selects a semantic tool
  -> tool runtime resolves purpose from the immutable policy snapshot
  -> registered model/provider executes generation or perception
  -> tool returns evidence, ResourceRef, or TaskRef
  -> Pi main model continues reasoning
```

领域工具名是 OpenNeko 内部身份，可以保留 `.`、`:` 等 package/operation 分隔符；Canvas、Cut、
Perception 等 owning package 不感知 LLM provider 的命名限制。只有 Domain Tool → Pi `AgentTool` 边界
把不兼容名称投影为稳定、互异、最长 64 字符且满足 OpenAI-compatible 规则的 wire name。权限预检、
领域执行、diagnostic 和产品/UI 事件必须反向解析为原始领域名称；未知 wire name 或投影冲突直接
fail-visible，不建立第二个领域工具 registry，也不改写 canonical Tool identity。

主模型不能从自然语言提示中自由指定任意 `providerId`/`modelId`。除非产品明确提供受控的
用户覆盖入口，工具 schema 只表达创作参数，不暴露底层模型路由。这样可以避免提示注入导致
越权 provider 调用、不可预期成本或绕过用户配置。

对当前 tool call 内完成的 bounded understanding，Pi tool bridge 从冻结的 purpose entry 创建
turn-scoped `ToolPurposeModelRuntime`。该 runtime 只暴露一次受限的多模态 completion，不提供模型
选择、registry 访问或 main-model mutation；它不会进入 tool 参数、model-visible metadata、transcript
或持久化事实。纯模型工具缺少对应 purpose binding 时不注册；同时拥有项目 facade 或本地分析路径的
混合工具可以保留非模型能力，但不得执行该 perception evaluator，更不得回退到 `agent.main`。

首个 canonical bounded-perception 入口是 `perception.image.understand`：参数只接受稳定
`ResourceRef` 和可选的观察重点，由 stable locator + `ContentReadService` 在工具内部有界读取字节，并且只能使用当前 turn 的
`image.understand` binding。工具返回 `neko.image-understanding.v1` 结构化证据、原始
`ResourceRef`、准确 purpose/model facts 和 usage；不得接受或回传绝对路径、cache path、
`providerId` 或 `modelId` 参数。旧 `perception.perceive` 的 `understandingModels` 覆盖属于待删除
AgentSession 路径，命中时必须 fail-visible，不能成为 Pi fallback。

Pi AI 当前通用消息内容只覆盖文本和图像，因此不得把音频/视频伪装成通用 Pi payload。CLIP、
Whisper、shot detection 以及 NewAPI 特有媒体协议继续由 OpenNeko 领域 runtime 拥有；只有在相应
Capability 能以稳定 `ResourceRef` 输入、程序配置拥有模型选择并返回结构化证据后才投影为 Pi Tool。
缺少该领域工具时直接报告不支持，不调用 `agent.main` 猜测，也不恢复旧 Platform chat。

如果同一条 assistant message 产生多个允许并行的 tool call，每个工具可以独立调用不同模型。
Pi 只负责工具调度；生成/感知模型的并发限制、成本策略和任务所有权仍由 OpenNeko runtime
负责。

### 8. 模型策略按实例隔离并在 turn/run 开始时冻结

- 每个 conversation 独立拥有可变的未来 turn 配置。
- 每个 turn 或 durable run 开始时捕获不可变的 `AgentModelPolicy` snapshot。
- 所有 model-backed operation 显式携带 conversation、turn 或 run identity。
- 界面 active selection 只选择展示投影，不能成为模型配置 owner。
- 正在执行的请求不受后续模型配置修改影响。

同一平铺快照允许两种明确的 execution owner，而不是两套模型层级：`agent.main` 与 bounded
understanding 保存可由 Pi 执行的 model contract；`image.generate`、`image.edit`、
`video.generate`、`audio.tts` 等保存由领域 runtime 执行的最小 provider/model identity。领域模型
不会伪装成 Pi chat model，也不要求虚构 context window 或 token limits；它仍和 `agent.main` 一起在
turn 开始时解析、校验并冻结。Pi Tool bridge 只把该 entry 的 identity/parameters 交给 owning media
executor，不调用 `completeSimple`。

`GenerateImage`、`TransformImage`、`GenerateVideo`、`GenerateMusic`、`GenerateTTS` 的模型可见
schema 不再包含 `providerId`/`modelId`。缺少精确 purpose 时工具不注册；若旧调用仍传路由参数则
fail-visible。成功提交立即返回 `{ source: "media-task", sourceTaskId }` 形式的产品 `TaskRef`，同时
保留现有 task scope 供取消、进度、恢复和终态关联。最终 generated-output `ResourceRef` 仍由
OpenNeko task observation/continuation 投递，Pi transcript 不成为 provider task state authority。

- 工具不得调用 `setModel()` 改写主 Agent 模型。
- 多实例不得通过共享全局 active model 切换参数。

### 9. 生成和感知采用不同的返回语义

感知工具通常在当前 tool call 内完成，返回结构化 evidence、诊断和稳定资源引用。主 Agent
只能依据这些证据推理，不能从文件名、生成提示词、任务 id 或缩略图猜测媒体内容。

视频、音频和其他长时间生成不得让 Pi tool call 阻塞到远端任务完成。工具应在成功提交后
快速返回 `TaskRef`/run identity，由 OpenNeko task runtime 持久化 provider task id、观察进度、
处理取消/恢复，并在完成后通过 canonical observation path 把 `ResourceRef` 和结果状态交回
会话。

### 10. 缺失配置和未知模型 fail-visible

- 未配置某个 purpose 时，默认不向主 Agent 注册对应工具。
- 若已注册工具在执行时发现 binding 缺失、陈旧或不匹配，返回明确 diagnostic。
- 未注册 provider/model、capability 不匹配、缺少凭据或 unsupported operation 必须失败。
- 不隐式回退到主模型、其他 provider、旧 Platform/AI SDK 路径或默认空结果。
- 若用户希望主模型兼任某个感知 purpose，必须显式把同一 `ModelRef` 绑定到该 purpose。

### 11. 首版采用 Pi 低层 Agent 与 primitives，不采用完整 Coding Agent/Harness

首版不依赖 Pi 的 Coding Agent、TUI 或 coding-specific shell/file workflow。

首版可以直接使用同包公开导出的 Skill、Session、JSONL 和 compaction primitives；采用这些
primitives 不等于采用 `AgentHarness`。`AgentHarness` 当前已经覆盖部分 session persistence、
resource、Skill 和 operation lifecycle，
但其上游文档仍把 model registry、完整 lifecycle/state pass、hooks、durable recovery、
auto-compaction 和 retry 的部分工作标为 planned/in progress。OpenNeko 首版因此使用低层
`Agent` 加上述 primitives；OpenNeko 保留 conversation/run/task 产品 owner，而不是继续维护
通用 transcript/session 实现。

只有上游明确达到 migration-ready，且 OpenNeko spike 证明它能在不增加 adapter 层的情况下
替代现有 owner，才重新评估 `AgentHarness`。

## 迁移边界

### 删除或替换

- `AgentExecutor`、Think/Act/ReAct loop；
- Platform LLM adapter registry 和各 chat adapter；
- Vercel AI SDK chat glue 与重复 stream aggregator；
- main/type/purpose 多级默认模型、首个 capability 匹配和其他隐式模型 fallback；
- 与 Pi 重复的基础 model/message/tool-call/queue 类型和生命周期实现；
- 现有 Skill loader/registry/service/injector、三轨 injection coordinator、ToolGuard、ToolSet
  activation、lifecycle store/projection/runtime、slot/conflict policy 和 Skill model override；
- `@neko/skills` 中错误归属于 Skill 的 Canvas/creative/quality/memory/validation/subagent runtime；
  仍被 OpenNeko 需要的业务逻辑迁回 owning domain/capability，普通 Skill 内容改为 `SKILL.md`；
- 自研 `ConversationManager`、Journal reader/writer/projection、重复 conversation storage/hydration、
  custom compaction 和承担多职责的 `AgentSession`；
- 只为旧调用链存在的 factory、facade、compatibility bridge 和 fallback。

### 保留并瘦身

- 现有 `AgentModelPurpose` 中仍有真实调用方的语义，但收敛为扁平 purpose map，不整包迁移沉重
  ConfigManager/Platform；
- OpenNeko 用户/工作区配置来源、credential persistence、Auth UI/provenance/redaction，以及到 Pi
  Provider/Auth/CredentialStore 的薄投影；
- 生成与感知 provider，特别是 Pi 没有等价覆盖的视频、语音和异步媒体任务；
- NewAPI 用户配置、Neko account gateway catalog/entitlement，以及迁入 owning media runtime 的
  图片、视频、语音、音乐和异步任务协议；NewAPI 聊天则通过 Pi，不保留旧 adapter；
- Skill Host source/trust/enablement/fingerprint、Capability、permission、MCP 和 ResourceRef；
- conversation/turn/run/task identity、conversation catalog、product projection 和后台任务 authority；
- package-owned creative apply 和 background task observation。

代码量下降不是唯一目标。更重要的验收条件是形成唯一调用路径，使外围功能开发只需注册
领域工具/Capability 和 UI 投影，不再修改 Agent loop 或 LLM provider adapter。

## 被否决或延期的方案

### 继续维护完整自研内核

否决。它要求本地创作产品持续维护通用 Agent loop、provider 协议和工具执行基础设施，挤占
外围创作能力开发投入。

### 只把 Pi 放在现有 Platform adapter 下

否决。这会同时保留 Pi 与 Neko 两套 model/message/tool/stream 契约，增加 adapter 和双路径，
不能产生设计简化。

### 单个 Pi Agent 同时绑定多个主模型

否决。Pi 的 Agent state 是单活动模型语义；生成/感知模型是工具依赖。需要主模型切换时只在
turn safe point 显式切换，不能与工具模型混为一谈。

### 保留现有 Skill Lifecycle 并在下方替换 Agent loop

否决。现有 Skill 已同时承担 prompt、Tool policy、模型覆盖、生命周期、冲突、UI 和领域 runtime，
把它接到 Pi 下方只会保留第二套控制面。OpenNeko 采用 Pi 的轻量 Skill primitives，并让真实执行
能力回到 Capability/Tool/runtime。

### 保留现有 AgentSession 并把 Pi 包成 executor

否决。现有 `AgentSession` 同时拥有 loop、prompt、Skill、permission、journal、memory、validation、
compaction、task observation 和 diagnostics。把 Pi 塞进 executor 位置不会减少 session 复杂度，
也会保留两套 message、queue、stream 和 persistence 语义。

### 首版采用 AgentHarness 作为全部 session/runtime

延期。上游仍存在 migration-ready TODO，且 OpenNeko 已经有更强的本地身份、ResourceRef、
durable media task 和投影约束。

### 完全自研 transcript/session persistence

否决。Pi 已公开 `Session`、JSONL repo/storage、context 和 compaction primitives；继续迁移 Neko
自研 Journal/ConversationManager 只会重复通用能力。OpenNeko 只保留 Pi Session 不表达的产品
conversation catalog、Run/Task、ResourceRef、permission 和 UI projection。

## 后果与风险

### 正面后果

- OpenNeko 不再自行维护通用 Agent loop 和主流 LLM adapter。
- Skill 收敛为可移植方法包，Builtin/project/personal Skill 通过同一 Pi loader 加载。
- Pi Session 成为唯一 transcript/context authority，现有多套会话持久化和 hydration 可以删除。
- 主 Agent、生成模型和感知模型的职责清晰，可同时配置和独立替换。
- 外围创作功能以工具/Capability 为主要扩展面。
- 可以删除相当数量的生产代码和重复测试，并避免把整个旧 Agent 子系统迁入 OpenNeko。
- 单实例配置 snapshot 和显式 purpose binding 降低并发状态污染与隐式路由。
- Provider-specific OAuth 和 token refresh 复用 Pi，OpenNeko 只保留产品配置、secret persistence 与
  Host 交互，减少重复认证代码。

### 风险

- Pi 是快速演进的外部依赖，API 和事件语义可能变化。
- `pi-ai` 引入多家 provider SDK，可能增加安装体积、扩展 bundle 和冷启动成本。
- Pi event/tool 类型与 OpenNeko projection、permission 和 task identity 之间仍需要一个薄 adapter。
- Pi Skill loader 对部分格式问题采用 warning/lenient 行为；OpenNeko 创建、安装和 trust 边界仍需
  在提交前执行严格校验，运行时不得为非法或不受信 Skill 静默授予能力。
- Pi `Skill.filePath` 是模型可见字符串；若 adapter 未先替换为 Host-owned `SkillLocator`，可能泄露
  绝对路径或让模型绕过 Skill trust/content boundary。
- Pi JSONL Session 格式和 context/compaction 语义可能随依赖版本变化；升级必须经过构建期
  reopen/branch/resume/compaction compatibility fixture。
- Pi 没有任意 OAuth 端点的数据配置式 factory；非内置、非 Radius-compatible provider 被明确延后，
  直到出现真实调用方再实现并验证 `OAuthAuth`、callback、取消和 credential 写入语义。
- 跨 Host lease 失效或接管若缺少 fencing，可能让两个进程同时推进同一 conversation；所有 turn 和
  checkpoint 写入必须携带当前 lease epoch。
- Pi 的默认行为不自动满足 OpenNeko 的 ResourceRef、workspace trust、后台任务和 fail-visible
  约束。

缓解措施：使用正常依赖版本范围与 lockfile，不建立人工固定版本政策；在构建/升级流程中执行
public API、事件、Session reopen/branch、Skill、Auth 和模型行为 compatibility tests。建立 adapter
contract tests；对事件顺序、取消、tool preflight、并发、错误传播和模型 snapshot 做
characterization tests；执行依赖许可、安全、包体积和冷启动审计。Pi 升级若不满足契约则构建失败，
不得通过旧路径 fallback。

## 验证与实施门禁

实施必须先更新相关 OpenSpec，并至少完成：

1. Pi `loadSourcedSkills` 从 builtin、project 和 personal roots 发现受信 Skill，只把 catalog metadata
   常驻上下文，并在需要时加载完整内容。
2. 测试证明模型只看到 `SkillLocator`，绝对 Skill/cache 路径不会进入 prompt、日志或项目事实，
   locator 只由 Skill Host 解析且不经过 `PathResolver`/`ResourceCacheService`。
3. `$skill-name` 或等价显式入口不建立跨 turn activation state；真实 Skill 输入保留在 Pi transcript，
   reopen/branch 不依赖第二 cache，并证明旧 lifecycle slot、ToolGuard、模型覆盖和
   `ActivateSkill`/`DeactivateSkill` state 未参与。
4. Pi Session 创建、append、关闭、reopen、branch/历史节点继续、buildContext 和 compaction
   fixture 通过；测试证明 `conversationId`、`branchId`、`sessionId` 独立且映射正确。
5. 跨 TUI/VS Code 测试证明只有当前 lease epoch holder 可推进 turn/checkpoint，其他 Host 只读且
   stale holder 写入失败；checkpoint 补写只在进程内，崩溃丢失不触发 outbox/journal fallback。
6. 测试证明完整 transcript 只有 Pi Session 一个 authority；SQLite 只权威保存产品 metadata，并且
   仅列表 projection 可重建；Run/Task/ResourceRef 不以 Pi custom entry 作为唯一事实。
7. 扁平 `agent.main` 与工具 purpose 同时携带模型和最终参数，测试证明执行期没有二级 purpose、
   类型默认、首个兼容模型或 main fallback。
8. TUI/VS Code 共享用户 CredentialStore，Host 只拥有 interaction；覆盖 API key、Pi 内置 OAuth
   login/refresh/logout、失败写入、取消和 secret redaction。只有实际配置 Radius 时验证 discovery；
   任意 `OAuthAuth` 不属于首版门禁。
9. NewAPI 测试证明聊天/理解经 Pi OpenAI-compatible provider 命中显式 endpoint/model/credential，
   媒体生成经 owning media runtime 返回 evidence 或 `TaskRef`；旧 GenericAdapter/AI SDK chat 未参与。
10. 一个真实主模型完成流式对话和普通工具调用。
11. 一个感知工具使用不同模型返回结构化 evidence。
12. 一个生成工具使用不同模型提交后台任务并返回 `TaskRef`。
13. 两个不同模型工具并发执行，且取消、identity 和结果投影互不污染。
14. 缺失 purpose、未知模型、capability 不匹配、缺少凭据和不受信 Skill 均 fail-visible。
15. 路径测试证明旧 Executor/Platform/AI SDK、Skill lifecycle 和自研 transcript/session path 未参与
    成功结果。
16. 运行受影响包测试、typecheck/build、`pnpm test:agent:eval` 和聚焦真实 Agent evaluation。
17. 验证 VS Code extension bundle size、激活时间、依赖许可和 secret/provenance 边界。

## 适用性

本 ADR 立即约束 OpenNeko 的 Agent 提取目标和新 canonical path。它不声称 OpenNeko 当前代码
已经完成迁移；在对应 OpenSpec 实施完成前，现有代码仍是当前行为事实来源。

迁移采用一次性替换：目标版本必须同时接通 TUI、VS Code Extension 与 Webview，并删除旧成功
路径。现有 prelaunch conversation/transcript 不迁移，作为无用户价值的旧数据显式丢弃；不得保留
旧 reader、importer 或 runtime feature flag。回滚只能回滚整个构建/源码版本，不能在运行时回退到
旧 Agent path。

本 ADR 是 Agent runtime、Skill/Session、模型路由与 Provider/Auth ownership 的最新 canonical
决策；与既有 ADR、领域文档或当前实现冲突时，以本文目标边界为准。以下既有 ADR 只在不冲突的
沙箱、任务队列和 continuation 边界上继续适用：

- [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)
- [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)
- [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)
- [`adr-agent-internal-continuation-boundary.md`](adr-agent-internal-continuation-boundary.md)

## 外部依据

- [Pi Agent Core README](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [Pi Agent types](https://github.com/earendil-works/pi/blob/main/packages/agent/src/types.ts)
- [Pi Skill loader](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/skills.ts)
- [Pi Harness Skill/Session types](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/types.ts)
- [Pi Session](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/session/session.ts)
- [Pi JSONL Session repository](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/session/jsonl-repo.ts)
- [Pi Coding Agent Skill behavior](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)
- [Pi Coding Agent Session behavior](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md)
- [Pi model runtime](https://github.com/earendil-works/pi/blob/main/packages/ai/src/models.ts)
- [Pi model and stream types](https://github.com/earendil-works/pi/blob/main/packages/ai/src/types.ts)
- [Pi auth and CredentialStore contracts](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/types.ts)
- [Pi Radius provider](https://github.com/earendil-works/pi/blob/main/packages/ai/src/providers/radius.ts)
- [Pi Radius OAuth discovery](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/radius.ts)
- [Pi AgentHarness lifecycle and migration status](https://github.com/earendil-works/pi/blob/main/packages/agent/docs/agent-harness.md)
- [Pi Agent package metadata](https://github.com/earendil-works/pi/blob/main/packages/agent/package.json)
- [Pi AI package metadata](https://github.com/earendil-works/pi/blob/main/packages/ai/package.json)
