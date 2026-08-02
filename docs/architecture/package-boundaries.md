# 包边界、公共层与运行平面

状态：Accepted

更新日期：2026-08-02
对应变更：`replace-desktop-media-scheme-with-http-resource-gateway`、
`enforce-thin-desktop-application-root`、`normalize-package-naming-topology`、
`define-character-chatroom-play-use`

本文定义当前一级 workspace 的依赖方向、公共能力 owner，以及 Electron Desktop 和
Node/FFmpeg 媒体运行时的边界。包名、入口和示例只描述当前 Electron Desktop 实现。
Package 角色、独立拆包条件、领域家族命名、显式 exports 和产品状态语义见
[`package-taxonomy.md`](package-taxonomy.md)。

## 分层与依赖方向

| 层级            | 主要包                                                                                                                              | 可依赖                          | 不得依赖                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| L0 host-neutral | `@neko/shared`、`@neko/content`、`@neko/entity-domain`、`@neko/search-domain`、`@neko/markdown`、`@neko/skills`、包自有 L0 contract | 更低层纯 contract/utility       | Electron、React、应用根、功能包内部实现                                           |
| L1 host/runtime | `@neko/host`、`@neko/media`、各功能包 host-neutral core/platform                                                                    | L0、明确 runtime dependency     | React/Webview 实现、`apps/*`、其他功能包内部实现                                  |
| L2 browser UI   | `@neko/ui`、`packages/<domain>/webview` package                                                                                     | L0、L2 公共 UI、包自有 contract | Electron、Node-only API、本地文件路径                                             |
| Application     | `apps/neko-desktop`                                                                                                                 | package public entries          | package root 下的 `src/` 内部实现、应用级领域/contract 副本、业务状态机/策略/事务 |

依赖必须自上而下组合：

```text
apps
  -> public package entries
  -> host/domain contracts
  -> shared/package-owned L0 contracts

Renderer/Webview -> UI/shared/package-owned Desktop contracts
Desktop Main -> host/domain/runtime contracts
Node media adapter -> FFmpeg/ffprobe process
```

任何跨层消息都先定义类型化 contract；任何跨包复用都走 public entry、port、facade command 或明确 adapter，不直接导入另一个包的内部实现。

workspace package 首先表达 owning responsibility，不以发布范围、消费者数量或 Host 数量为前提。领域规则、
业务状态机、配置解析、业务校验、数据变换、同步/恢复/authoring/portability workflow 即使只有 Desktop
一个调用方，也必须由对应 `packages/*` owner 持有。只有跨两个以上相同语义和生命周期的 package
复用，才需要进一步提升到共享层；“不应过早共享”不等于“可以把业务逻辑放进 apps”。

## 公共包职责

### `@neko/shared`

`packages/shared` 是零依赖或低依赖基础能力 owner，只保留 Logger、Errors、Job lifecycle、
稳定值工具和路径等领域中立入口。i18n、Theme 与 React 能力归 `@neko/ui`，跨 runtime 业务契约归
owning package。

- L0 入口不得导入 DOM、React、Electron 或功能包。
- renderer/host 专用能力由 owning package 的明确子路径暴露，不能污染通用入口。
- 功能包不得复制 package-local logger、i18n runtime、theme token、error 类型、path resolver 或项目文件 IO。

### `@neko/host`

`packages/host` 提供 host-neutral application identity、project/file/config/credential 等宿主 port 和组合辅助。

- 具体 Electron Main/preload 或 Node adapter 在 Desktop 宿主边界实现。
- host-neutral core 不读取 Electron API、DOM 或 renderer global。
- application identity 是路由契约，不会创建产品入口，也不能让已移除产品成功启动。

### `@neko/media`

`packages/media` 提供领域中立的媒体契约，以及隔离的 Node 与浏览器
runtime 入口。

- 通用入口只包含 probe、prepared media、seekable URL/PCM descriptor、失败范围和生命周期契约。
- `@neko/media/node` 拥有 FFmpeg/ffprobe 进程、PCM framing、取消、背压和最小 file/PCM
  publication port，不解析 `ContentLocator`、项目事实或工作区路径，也不拥有 Electron
  protocol 或 Desktop exact-resource registry。
- `@neko/media/browser` 拥有原生 HTML audio/video 生命周期与显式 PCM client，不访问
  Node、Electron 或本地路径；普通单资源播放不得因 codec 或 transport 猜测自动改走 PCM。
- Preview、Canvas、Tools、Agent、Assets 与 Cut 必须通过各自的窄领域端口组合
  这些能力，不得重新创建宽泛媒体 client facade。

### `@neko/content`

`packages/content` 拥有文档解析、locator/range、entry ref、图片元数据探测和格式识别等跨领域内容语义。

- `@neko/content` 与 `@neko/content/core` 只暴露 renderer-safe contract 和纯语义；文档读取服务必须从
  `@neko/content/document` 显式导入，Node 文件/容器实现必须从 `@neko/content/node` 或
  `@neko/content/document/node` 显式导入。
- 通过 runtime deps 注入文本、二进制和 container 读取能力。
- 不管理 cache root、Webview URI、runtime token、workspace 生命周期或 UI 状态。
- Agent 和领域包复用公共入口，不重新实现 document reader/cache/path/media catalog。
- 文本实体分析复用 `DocumentAccessService` manifest/cursor/range：PDF page、EPUB chapter、DOCX section/paragraph 的正文只在 transient analysis batch 中存在；Content 分别返回语义 `DocumentLocator` 与内容 `ContentLocator`，不拥有 SQLite projection。

### `@neko/generation`

`@neko/generation` 根入口只暴露 renderer-safe 请求、结果、Job contract 与领域 contract。
`GenerationJobCoordinator`、持久化 store 和 purpose port 只能从 `@neko/generation/job` 导入；媒体
provider、下载、输出落盘与生命周期实现只能从 `@neko/generation/media` 导入。Webview 不得通过根入口
间接加载 `node:crypto`、文件系统或 provider runtime。

### `@neko/entity-domain` 与 `@neko/search-domain`

实体和搜索是 host-neutral 跨领域服务。

- core/projection 通过 port 注入文件、锁、日志和事件能力，不依赖 Electron、React 或功能包内部实现。
- Desktop Main 组合 Entity runtime、Media Library、metadata binding 和 Inspector 所需 host ports。
- Canvas、Assets 和 Agent 通过 canonical facade/contract 访问 Entity；不存在 Dashboard fallback。
- projection 不泄露 store/cache/index 绝对路径、token、Webview URI 或 manifest path。
- `@neko/search-domain` 的 semantic source coordinator 拥有 source scope、fingerprint、freshness、reconciliation 和 analyzer scheduling；`@neko/entity-domain` 提供 host-neutral deterministic text analyzer，二者通过共享 semantic-source contract 组合。
- `@neko/entity-domain` analyzer 不监听文件、不打开 SQLite、不写 project facts；Desktop Main 只能通过 coordinator ports 提供文件、confirmed snapshot 和 projection commit。
- `@neko/search-domain` 只调度 eligible 创作文档；普通 JSON/YAML 和媒体文件不进入文本 analyzer。Entity/record 查询返回 compact occurrence relation，可见上下文由 Host 经 Content locator 回读。

### `@neko/ui`

`packages/ui` 是 React/Webview 公共 UI 层。

- 只拥有无业务 UI primitive、viewport/layout、foundation、keyboard/focus、hooks 和测试辅助。
- 不拥有 contribution registry、产品生命周期、宿主权限、媒体执行 operation 或 Agent runtime。
- `workbench` UI 若保留，只是 render-only primitive；它不得依赖已移除 Workbench Core，也不得成为第二套 runtime registry。
- 新增组件前先审计公共 primitive、同包 components/hooks/shared 和相邻保留包；跨两个以上 Webview 的无业务 UI 才适合提升到公共层。
- 生产 Renderer/Webview 不直接访问 Electron/Node 或建立本地 mock/fallback transport，应使用
  package-owned typed Desktop host port。

## 组合包已移除

`@neko/workbench-core` 和 `@neko/market-core` 不在 workspace 中。保留 Canvas、Cut、Agent 和 Preview Webview 直接暴露 package-owned host adapter；应用根显式组合这些公共入口。

不得通过 TypeScript alias、空 package、旁路 export、动态 optional import 或成功 no-op 建立第二个组合层。未来出现两个以上真实、同生命周期、同错误模型的复用点时，应先通过 OpenSpec 定义新的中立 contract。

## Desktop Main 与 preload

Desktop Main 拥有 Electron trust boundary、文件/凭据/外部进程的具体授权 adapter、窗口和后台宿主
资源生命周期，但不拥有使用这些资源作出领域决策的业务流程：

- 组合 package public entry，并为每个窗口/编辑器实例创建显式 runtime；
- 解析 typed IPC、绑定 sender/instance identity，并调用 owning package public application port；
- 在 owning service 解析 `ContentLocator` 后，把 exact seekable byte source、one-shot PCM 或
  frozen resource set 注册到 app-lifetime Desktop exact-resource registry；
- 为 Window/View/session/renderer-epoch/generation 注册和撤销 opaque resource，并绑定允许的
  `webContentsId`；URL 不含本地路径或稳定内容身份，也不得持久化；
- 通过领域窄 port 编排 `@neko/media/node` 操作；
- 在窗口关闭、取消和应用退出路径显式释放资源。

若逻辑只需要注入的 file/time/credential/process port，而不需要 Electron object 或 sender/window
identity，并负责业务结果、状态、错误或恢复策略，它属于 owning package 的 host-neutral 或 Node
application service。Desktop 只保留 port implementation、产品 wiring 和结果投影。不得以 Desktop-only
为理由在 Main 中保留领域实现，也不得建立宽泛 `desktop-core`、manager bag 或第二套 contract。

preload 只向已授权 sender 投影最小 typed IPC port，不暴露通用 `ipcRenderer`、文件系统、
shell、process handle 或任意 channel。Desktop Main 不导入 React、不复制媒体计算，也不
中继高频视频帧或 PCM。

Desktop app-owned Canvas、Assets、Application Settings 与 Agent 业务 owner 已按
`enforce-thin-desktop-application-root` 收敛到 package public entry。Main 中保留的大型 runtime
是 Electron trust/resource adapter 与 package session composition，不构成领域实现先例；新增或触碰
时仍必须通过五层审计和 application boundary gate。

文件发现边界：

- Desktop Assets binding 从 `neko/assets/<libraryName>` direct links 派生授权 root，并负责 watcher、trust、Host path guard、目录读取、取消和生命周期；不存在 target settings registry。
- 文件事件只触发 host-neutral coordinator；发现文件不得创建 Entity/binding、写 catalog 或分配文件 identity。
- semantic/entity projection 使用 `LocalMetadataStore` 的用户级 SQLite binding；Webview 和功能包不接收数据库路径或 raw SQL。

## Webview

Webview 负责浏览器沙箱内的 UI、用户交互和可恢复展示状态。

- 可以使用 React、Zustand、`@neko/ui`、共享 Webview facade 和包自有 components/hooks。
- 不能导入 `electron`、`node:*`、`fs`、`path` 或 Desktop Main/preload 实现。
- 不能直接读写 workspace、持久项目事实、SecretStorage 或外部进程状态。
- `openneko://resource` URL、opaque ID、blob URL、stream handle 和 Webview URI 只能是短生命周期投影，不能
  写回项目文件、Agent/provider/Tool 输入、clipboard 或未脱敏日志。
- 媒体入口必须遵守 CSP、codec 和 Range 边界；错误应展示明确 diagnostic，不伪装成功。

Desktop 应用和本地资源统一使用 `openneko:` scheme：`desktop` host 只服务可信 bundle，
`resource` host 只服务短生命周期授权资源。CSP 只按已审计 consumer 开放
`openneko://resource`；`session.webRequest` 使用实际 `webContentsId` 限制 sender。
`neko-app:`、`neko-media:`、`opennekomedia:`、`file:` 以及私有
`media:`/`video:`/`audio:` scheme 和 production loopback HTTP 都不是成功路径。

涉及视觉、交互、CSP、焦点、IPC 或媒体的验收必须运行真实 Electron Desktop；普通浏览器只适合纯浏览器兼容辅助。

## Node/FFmpeg 媒体运行时

当前媒体边界由 `@neko/media`、领域 port 和 Node/FFmpeg adapter 组成，不保留平行媒体 client。

- H.264/Range、原生 HTML video、PCM、抽帧、波形、转码和导出遵循
  [`media-runtime.md`](media-runtime.md)。
- Cut 有声 timeline 由 Host 混合 framed PCM 并拥有 master clock；Canvas 普通 audio/video、
  Preview 和 Agent 展示使用原生 `<audio>` / `<video>`。Canvas 只有显式同步、混音或分析
  operation 才可使用独立 processed/PCM contract；实时采集走 MediaStream/WebRTC 或专用
  live runtime。
- OTIO、Canvas 文档、Agent 会话和其他项目事实由 owning domain 持有，FFmpeg
  只是有界执行 adapter。
- 新媒体能力先更新中立 contract，再接 owning package adapter 和真实 Renderer
  路径测试；不得建立第二套 route/client/DTO。

## Agent、AI 与 Host 子包

Agent 能力按 owning package 职责分层：

| 子包                    | 职责                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@neko/agent-contracts` | Agent/Main/preload/renderer contract、effective configuration、facts 和状态投影                                            |
| `@neko/agent-runtime`   | Pi product runtime、conversation identity、permission、Skill Host、Capability Tool bridge、facts projector 与 host effects |
| `@neko/ai-contracts`    | provider/model configuration contracts                                                                                     |
| `@neko/ai-sdk`          | provider/AI SDK adapter                                                                                                    |
| `@neko/host`            | Host settings、配置解析、credential/file port contract 与应用设置状态机                                                    |
| `@neko/agent-webview`   | Chat/Agent UI、消息投影和用户输入                                                                                          |

Desktop 的产品级组合位于 `apps/neko-desktop`。Agent contracts/runtime 与 Host 不导入 Electron、React
或 Webview；Webview 不导入 Agent runtime、provider adapter 或 Desktop Main。Prompt、Skill、
capability/tool schema 和宿主副作用按各自边界维护。Pi 只接收已经解析好的
model/prompt/tool snapshot，不接收 `ConfigManager`、领域 service 或 Host process adapter。

`@neko/shared/job-lifecycle` 只提供 typed Job identity、phase、revision/CAS、终态不可变和
versioned observation。Generation、Cut 等 owning domain 各自拥有 submit、具体 snapshot
schema、provider/executor identity、持久 migration、reconciliation、retry policy 和原子结果提交；
不得建立中央 `GenericJobManager`、共享 payload/result 表或跨领域 execution registry。Agent
只能通过 Tool Call 调用具体领域 port，Webview 只消费 Host-owned Activity projection，不拥有
Job 生命周期或 provider/executor observer。

所有媒体生成入口统一调用 `@neko/generation` 的 public Job application port。Canvas、Cut、
Character、Agent Tool 和 Desktop 都是调用方；领域包不得通过 Agent chat 或 Desktop
`purposeMediaService` 或 Platform media service 转发生成。Host 解析 immutable effective
provider/model binding 并注入 port。调用方只保存 target/provenance 与 JobRef 的关联，通过
snapshot-first `observe(afterRevision)` 消费 commit 后事件，不直接轮询 provider。

Agent 运行身份只保留前台 Agent Run 和显式 SubagentRun。独立 BackgroundAgentRun 没有生产
owner，不进入 runtime、协议或 UI；未来若出现真实独立需求，必须重新建立 OpenSpec。

Quality 的边界由 [`adr-agent-runtime-single-authority-and-simplification-boundary.md`](adr-agent-runtime-single-authority-and-simplification-boundary.md) 定义：`@neko/quality` 已建立为中立 runtime，拥有 canonical contract validation、evidence freshness、Gate aggregation、evaluator port、provider-neutral model adapter 和通用 ProjectQuality facade orchestration；owning package 继续拥有领域 rubric、目标 materialization、确定性检查、Gate policy、repair 和 apply。跨包 contract 暂留 `@neko/shared`；Desktop Agent composition 只保留 Tool/Capability、purpose-model 和授权资源 materializer 适配。

Capability 是 OpenNeko 产品扩展 seam，领域包提供定义，Host 负责 discovery/trust/lifecycle，Pi bridge 只投影当前 turn 的不可变 Tool snapshot。External Processor 不是 Pi 或平行 Capability 系统；它只能作为 Host 中受管、可取消的 Tool implementation，并继续遵守路径、资源、环境、网络、审批和用户数据边界。

## 保留领域包

| 包                  | 主要职责                                                                   | 关键边界                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@neko/agent-*`     | Agent session、provider、Skill、capability 与 Chat UI                      | runtime host-neutral；宿主与 UI adapter 分离；行为变更需真实 evaluation                                                                                                                                                                                                        |
| `@neko/generation`  | 生成请求/结果契约、execution port 与 recoverable Job                       | 只依赖共享契约；不读取配置或 credential；provider runtime 由现有 Host 注入；不创建独立 Host 或 UI                                                                                                                                                                              |
| `@neko/chara`       | Character 创作语义、Dialogue/Embody、证据、剧情/日常运行编排与日常关系记忆 | 当前仅保留未接入的 core/application kernel；具体 adapter 由 Desktop 注入；运行只消费唯一 AgentSession contract，不拥有第二套 Agent loop                                                                                                                                        |
| `@neko/quality`     | canonical Quality Gate、evaluator port 与模型证据适配                      | 只依赖共享 contract；领域 rubric/repair/apply 留在 owning package；provider/config/credential 和 Host IO 由组合层注入                                                                                                                                                          |
| `@neko/assets-*`    | Media Library 文件入口、全局 Media/Asset 浏览投影和 Entity Desktop surface | 文件走 canonical locator/Host Content I/O；全局浏览只接收 opaque identity、revision 和安全 thumbnail descriptor；owned Asset IO 与外部 Media Library link lifecycle 由 Desktop Host 执行；Entity 走 canonical facade；不拥有持久 catalog、package/generated lifecycle 或 cache |
| `@neko/canvas-*`    | 六类通用节点、空间布局、连接、投影与 `.nkc` authoring                      | Webview 管交互；只持久化 Markdown/Media/Group/Job/File/CanvasEmbed 与三类连接；Job/Character/World runtime 外置；复用公共 UI                                                                                                                                                   |
| `@neko/cut-*`       | Timeline、视频编辑、媒体控制与导出                                         | Webview 管时间线交互；Desktop Main 管 editor/export adapter；媒体走 `@neko/media` 窄端口                                                                                                                                                                                       |
| `@neko/preview-*`   | 授权只读预览与临时 3D Reference staging                                    | Preview 拥有媒体 session 和面板级 Three.js 会话；Agent/Canvas/media 只消费共享 contract；不拥有持久 3D 项目                                                                                                                                                                    |
| `apps/neko-desktop` | Electron 产品组合根                                                        | 拥有 Main/preload/renderer 生命周期、typed IPC、安全策略、平台打包与产品验收；领域实现仍由 `@neko/*` 包拥有                                                                                                                                                                    |

Tools media-diff 原型因没有 Desktop producer、产品入口或运行态验收已退役；未来若重新引入，必须通过独立 OpenSpec 同时建立 domain/node/Webview 与真实 Desktop composition。

## Character / World 顶级领域聚合包

Character IP 与 Interactive World 已确定为独立 bounded context，必须作为平级顶级领域包存在，不得嵌入 Agent、应用根或现有 Assets/Preview 内部。`@neko/chara` 已完成第一阶段 owner 迁移；World package 仍未实现：

| 包            | 状态                                   | 聚合主线                                                          | 主要职责                                                                                                                                              | 关键边界                                                                                                                   |
| ------------- | -------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@neko/chara` | 第一阶段 kernel 已建立、Desktop 未接入 | `CharacterProject -> CharacterVersion -> narrative/companion run` | 当前只拥有 Character Dialogue、Embody、角色证据和 Profile Assembly 内核；项目/版本/发布、剧情 save、日常 relationship 及 Desktop 产品组合仍待后续实现 | 完全复用 Agent/Pi；World/Narrative、Entity、Assets、Voice、Renderer、Media/Game Activity 只通过公共 ref/port/provider 组合 |
| `@neko/world` | 拟议                                   | `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay`    | 世界事实、规则/事件、Gameplay、运行、存档、分支和回放                                                                                                 | 只通过 CharacterVersion/WorldCharacterBinding 使用角色；世界局部状态不回写全局角色；不以 Agent/UI 状态代替世界事实         |

“顶级”指领域所有权，不指 concrete Composition Root。`apps/neko-desktop` 负责注入具体
Agent、Renderer、Device、表现 runtime 和 host adapter。Agent package 不导入 Character/World；
Character core 不导入 World 私有实现；运行期环境交互通过窄 port 或 host-owned adapter 组合。

角色只拥有说话、动作、表情、移动意图、感知、交互 affordance 和个体行为策略；地图、目标、任务、战斗、经济、成长、事件调度和整体胜负状态归 World。当前缺失的 Character Project/Version、World、Device/Live、Scene/Puppet 和持久 2D/3D 路径必须保持 fail-visible，不能因为基础 package 已建立就宣称支持。

角色互动体验按 `single-character | multi-character` topology 与 `dialogue | play` interaction
两个维度组合成单角色对话、多角色对话、单角色 Play 和多角色 Play 四个产品预设。Play-use 只是
Play 的内部执行机制。预设只组合共享 contract，不建立四套
session/controller。每个 agent-controlled character 映射独立 CharacterRun 和 primary
AgentSession；room 只共享带 actor/visibility/revision 的有序 event projection，不共享 responder、
transcript、模型配置或 memory view。human-controlled participant 不创建隐藏角色 Agent。

Play-use 表示角色通过 Game Activity 进行代打、陪玩、观战或指导。`commentator` / `coach` 只读，
`co-player` / `delegate` 必须绑定明确 ActivitySession、seat 和 per-seat exclusive control lease；
同一 seat 不得由多个 Agent 并发输入。Game/World owner 拥有规则、状态、席位、动作验证和结果，
Desktop Host 拥有精确 app/process/window binding、OS 权限、授权 observation 与输入原语，Chara
只拥有角色参与策略、稳定 Activity ref 和经筛选的记忆候选。Computer Use 只能作为显式、资格化、
有 step budget 且可 Pause/Stop/Take over 的 transport，不能在 adapter/API 失败后静默接管键鼠。

Play 的模型分工固定为：LLM/AgentSession 负责角色表达、规则理解、长期策略、协作、记忆和上下文
编排；VLA 或等价低延迟 control policy 负责实时游戏的短时 observation-to-action chunk；Game
Activity owner 负责 action/state/revision/outcome 验证。回合制策略游戏可以只用结构化 LLM
planning，实时动作游戏使用 VLA 短时闭环，多人游戏增加 seat/team/visibility 和 room coordination，
但都复用同一 Activity contract。

新游戏通过 versioned GameCapabilityProfile、规则/教程检索、安全校准、可选用户示范、有限 episode
试玩、结果验证和 retrieval/in-context experience 快速适应。Game-specific adapter 只表达目标、
observation/action/verification seam；Chara、Agent 和 Desktop 不得按游戏名称增加专用 controller，
常规接入不得要求重新训练基础模型。游戏经验属于 Game Activity 的可重建 projection，不得写入
CharacterVersion、relationship memory 或 Agent compaction。

角色创作与运行使用以下 canonical split：

```text
CharacterProject
  -> immutable CharacterVersion
       -> NarrativeCharacterBinding -> NarrativeCharacterRun
            memory owner: NarrativeSave / WorldSave
       -> CompanionBinding -> UserCharacterRelationship -> CompanionRun
            memory owner: UserCharacterRelationship
```

产品“剧情模式 / 日常模式”分别对应 `narrative / companion` runtime kind。Kind 在 run 创建时
固定，不能通过 active tab、共享 responder 或参数切换修改。剧情运行绑定显式 save、branch、
checkpoint/timepoint 和 actor identity；日常运行只接受发布 CharacterVersion，并通过独立
relationship identity 保存跨会话互动记忆。

两个聚合包内部必须保持以下依赖层级：

```text
core -> shared refs / domain values
application -> core + package-local consumer ports
adapters/agent -> application ports + public Agent contracts
adapters/chara|world -> public cross-domain contracts + owning ports
host-* -> public package entry + concrete host adapters
```

`core` 不得导入 Agent、Electron、React、Renderer、Device、表现 runtime、Media/Game
Activity 或另一领域私有 runtime。应用 Host 只构造、注入和释放 adapter；Chara application
service 拥有 mode-specific run、context、relationship binding 和 memory candidate 编排；
World/Narrative application service 拥有剧情 event/save/branch/replay；Activity owner 拥有
媒体、游戏和设备执行。上述依赖必须通过 public/subpath exports 和 architecture test 强制
执行，不能只依赖目录命名。

同一 published narrative actor 的运行路径固定为
`WorldActorInstance -> NarrativeCharacterRun -> primary AgentSession`，World 不得再创建
第二个 actor-level session；Ambient NPC 和 World Director 使用独立显式 scope。日常路径固定
为 `UserCharacterRelationship -> CompanionRun -> primary AgentSession`；relationship 可顺序
创建多个 run，但同一 active run 至多一个 primary session。

剧情有效能力是 Host permission、workspace trust、CharacterVersion policy、World binding
policy 与 NarrativeRun scope 的交集；日常有效能力是 Host permission、workspace trust、
CharacterVersion policy、relationship policy 与 Activity scope 的交集。副作用提交时由 owner
重验 permission、identity、revision 和 Approval。

Character 不直接写 World store；跨域 mutation 必须通过显式 world run/actor/action identity
与 expected revision 的 WorldAction contract，由 World runtime 原子提交 WorldEvent/revision
或返回 typed rejection。CharacterVersion canon、NarrativeSave/WorldSave 剧情记忆、
UserCharacterRelationship 日常长期记忆、CharacterRun 短期状态与 Memory infrastructure
派生索引必须保持独立。

剧情检索必须先由 save owner 按 branch ancestry、checkpoint/timepoint、actor knowledge 和
revision 过滤；日常 RealityContext、Tool result 和 Activity state 只能产生受 policy 管理的
关系记忆候选。跨模式记忆默认隔离，版本更新通过新 save/relationship revision 显式迁移，
不得改写 CharacterVersion。Device/Renderer/Media/Game live handle 和本机路径不得进入持久
项目、版本、存档或关系记忆。

## 路径、缓存与用户数据

- 跨包与持久内容身份只使用 stable `ContentLocator`；entity/artifact/job/output ID 与 provenance 保持独立。不得并列保存 raw path、旧资源引用、provider URL、base64 或 Webview URI作为第二内容身份。
- owning package 可在文件操作参数中使用 workspace-relative path 或保留用途的 `${VAR}/path`；Host 派生缓存使用 cache-owned descriptor。二者都不得替代或反向污染跨包 `ContentLocator`。
- 本机绝对路径只允许存在于本机设置、临时运行时状态或明确 host adapter 内。
- Cache 是可重建派生数据，不能替代项目、Entity、Media Library locator、generated/package owner 或 Agent 事实。
- 用户 secret 不写入项目文件、日志、Webview state、prompt 或 Skill。
- 跨包 mutation 通过 facade/port/command 和明确 error contract，不直接写另一个包的私有存储。

## Canvas 素材来源、生命周期与动作组合

Canvas 只拥有节点布局、连接和 durable projection，不拥有素材字节、媒体库 membership、
Generation recipe、viewer/editor 或 provider execution。素材进入 Canvas 固定为四条路径：

1. 工作区文件和已链接的项目 Media Library 文件直接保存原 `ContentLocator`，不复制字节；
2. 全局 Media Library 文件先由 Media Library owner 显式关联整个库，或显式复制到项目可授权位置；
3. 任意工作区外文件由 Host 原子复制到 `neko/imports/<kind>/`，再用新的项目 locator 创建节点；
4. AI 素材先进入 Generation-owned draft/Job，只有 owner 成功提交的
   `generated-output` locator 才投影为 Media/File 结果节点。

素材来源只能由 validated locator 推导：`workspace-file`、`document-entry`、
`package-resource` 是 referenced，`generated-output` 是 generated。扩展名、目录名、
provenance 文本、历史 prompt 和运行时 URL 都不得成为来源 authority。历史生成摘要只用于
展示；重新生成必须用稳定 `JobRef<'generation'>` 向 Generation owner 解析权威 recipe，
并创建新的 Job、output identity 和 lineage，不能覆盖旧结果。

Canvas selection toolbar 只投影 Host 在精确 project/Canvas/revision/selection 上解析出的
owner capability descriptors。Preview、Cut、媒体/模型和 Generation 继续由各自 package
执行；Canvas 不导入或复制其 viewer、editor、codec、provider 或文件写入实现。普通引用节点
只得到适用的读取、复制、交接和非破坏派生动作；生成结果节点在 Generation authority 仍可
解析时，才额外得到重新生成或进入 Generation/Agent draft 的入口。

## 验证命令

按改动影响范围组合运行：

```bash
pnpm check:deps
pnpm check:agent-boundaries
pnpm check:legacy-debt
pnpm check:unused
pnpm test
pnpm build
pnpm package:desktop
pnpm --dir packages/media test:run
```

Renderer/Webview 运行态验收不进入 CI；通过真实 Electron Desktop 在本地执行。场景由 owning
package 维护业务 fixture 和断言，证据只能使用隔离合成 workspace，并按仓库规则脱敏。
