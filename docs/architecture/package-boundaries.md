# 包边界、公共层与运行平面

本文定义当前一级 workspace 的依赖方向、公共能力 owner，以及 Electron Desktop 和
Node/FFmpeg 媒体运行时的边界。
Package 角色、独立拆包条件、领域家族命名、显式 exports 和产品状态语义见
[`package-taxonomy.md`](package-taxonomy.md)。

## 分层与依赖方向

| 层级            | 主要包                                                                                                                                              | 可依赖                          | 不得依赖                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| L0 host-neutral | `@neko/shared`、`@neko/content-domain`、`@neko/entity-domain`、`@neko/search-domain`、`@neko/markdown` 默认入口、`@neko/skills`、包自有 L0 contract | 更低层纯 contract/utility       | Electron、React、应用根、功能包内部实现                                           |
| L1 host/runtime | `@neko/host`、`@neko/media`、各功能包 host-neutral core/platform                                                                                    | L0、明确 runtime dependency     | React/Webview 实现、`apps/*`、其他功能包内部实现                                  |
| L2 browser UI   | `@neko/ui`、`@neko/markdown/rich-surface`、`packages/<domain>/webview` package                                                                      | L0、L2 公共 UI、包自有 contract | Electron、Node-only API、本地文件路径                                             |
| Application     | `apps/neko-desktop`                                                                                                                                 | package public entries          | package root 下的 `src/` 内部实现、应用级领域/contract 副本、业务状态机/策略/事务 |

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
- application identity 只用于路由，不创建产品入口或能力。

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

### `@neko/content-domain`

`packages/content` 拥有文档解析、ContentLocator selector、reader-private range/coordinate、图片元数据探测和格式识别等内容语义。

> 项目媒体和普通文件都使用 canonical `ContentLocator`。项目到 Agent 的 producer 才把已授权媒体
> 投影为受控软链接下的 Workspace 文件；Agent 不感知 Media Library、全局 connection、物理 target
> 或 `.neko` binding，其他项目消费者不得持久化 Agent 专用运行时投影。

- `@neko/content-domain` 与 `@neko/content-domain/core` 只暴露 renderer-safe contract 和纯语义；文档读取服务必须从
  `@neko/content-domain/document` 显式导入，Node 文件/容器实现必须从 `@neko/content-domain/node` 或
  `@neko/content-domain/document/node` 显式导入。
- 通过 runtime deps 注入文本、二进制和 container 读取能力。
- `@neko/content-domain` 的跨应用地址只保留 Workspace/Package file authority 与可选 selector；EPUB/CBZ 使用
  entry、PDF 使用 page、DOCX 使用 text-range。Host 可读取
  Agent 专用的 `neko/assets` Workspace 投影，但 guard 只允许精确 binding-backed managed link 跨越
  Workspace realpath，并拒绝普通 symlink 与 nested escape。
- 不管理 cache root、Webview URI、runtime token、workspace 生命周期或 UI 状态。
- Agent 和领域包复用公共入口，不重新实现 document reader/cache/path/media catalog。
- 文本实体分析复用 `DocumentAccessService` manifest/cursor/range：PDF page、EPUB chapter、DOCX
  section/paragraph 的正文只在 transient analysis batch 中存在；reader coordinate 只在 Content
  内部参与解码，跨应用结果统一投影为完整 `ContentLocator`，Content 不拥有 SQLite projection。

### `@neko/project-domain`

`@neko/project-domain` 拥有稳定 Project identity、混合 Creative Workspace membership、独立
ProjectEntity/CharacterProject association facts，以及 owner-qualified Project Content projection。
工作区可以同时包含 Content、本地可编辑 Character/World 和只读的全局 Character/World 精确版本引用。
Project 不拥有第二份 Character/World payload、全局版本、同步冲突规则或运行资格，也不解释 Workspace raw path。

- `@neko/project-node` 只在 Host 已授权的 Workspace root 内原子读写 `neko/project.json` 与
  `neko/project-bindings/entity-character/` 的精确 Project-owned facts；不得读取
  `neko/project-composition.json`、扫描其他 Workspace、读取用户级 SQLite 或提供 fallback repository。
- `@neko/project-webview` 拥有 Project catalog 和混合 Creative Workspace browser presentation；Desktop 只组合其 public Root。
- 全局 Character/World 对象与不可变领域版本分别由 `@neko/chara-node` 和 `@neko/world-node`
  的 catalog repository 在授权的全局存储 root 内管理；它们不是 Workspace，也不通过 Renderer grant
  或独立库目录访问。Renderer 和领域事实不得接收展开后的绝对路径。
- Project-local Character/World facts 由 `@neko/chara-domain` / `@neko/world-domain` 及其 Node repositories 拥有；
  Project 只通过固定 public owner port 提交和投影精确 membership。同步到全局、复制全局版本为本地对象、
  以及单版本 ZIP 导入导出仍由对应领域 owner 决定。
- 全局 Character 不要求 Entity；项目本地 Character 由 Project-owned association record 保存精确
  `projectId` owner 下的 `entityId + characterProjectId` 关联。不得把 `entityId` 写入
  CharacterProject，或按名称、
  active/current Project 自动推断关联。

### `@neko/generation-domain`

`@neko/generation-domain` 根入口只暴露 renderer-safe Recipe、请求、结果、Job contract 与领域 contract。Generation
统一拥有 Prompt/Image/Audio/Video Recipe union、typed defaults、校验、purpose mapping 与 Job request
投影；Canvas 可以持久化该 public Recipe 值，但不得定义平行 Recipe、默认目录、validator 或 request mapper。
`GenerationJobCoordinator`、持久化 store 和 purpose port 只能从 `@neko/generation-domain/job` 导入；媒体
provider、下载、输出落盘与生命周期实现只能从 `@neko/generation-domain/media` 导入。Webview 不得通过根入口
间接加载 `node:crypto`、文件系统或 provider runtime。

### `@neko/entity-domain` 与 `@neko/search-domain`

实体和搜索是 host-neutral 跨领域服务。

- core/projection 通过 port 注入文件、锁、日志和事件能力，不依赖 Electron、React 或功能包内部实现。
- `@neko/entity-node` 拥有 canonical repository、Host-owned Entity/binding identity materialization，
  以及 candidate confirmation 跨 canonical fact 与 rebuildable projection 的 workspace-scoped recovery
  journal；Desktop Main 不解释这些 operation 或恢复规则。
- `@neko/assets-node` 的 Resource Browser runtime 通过 package-owned `entity.manage` typed intent
  委托 exact Entity owner；它读取 canonical Entity snapshot 与 local-metadata candidate/availability
  projection，但不复制 Entity 语义或写项目文件。
- Desktop Main 组合 Entity runtime、Media Library、metadata binding 和 Inspector 所需 host ports；
  复用既有 sender-bound Resource Browser bridge，只注入 exact workspace identity、canonical
  repository 与 local-metadata public repository。
- `@neko/search-local-metadata` 已由生产 Resource Browser Entity projection 路径直接使用，因此是
  `active-product` Node package；它只持有可重建 candidate/occurrence/availability rows，不得升级为
  Project Entity fact authority。
- Canvas、Assets 和 Agent 通过 canonical facade/contract 访问 Entity；不存在 Dashboard fallback。
- projection 不泄露 store/cache/index 绝对路径、token、Webview URI 或 manifest path。
- `@neko/search-domain` 的 semantic source coordinator 拥有 source scope、fingerprint、freshness、reconciliation 和 analyzer scheduling；`@neko/entity-domain` 提供 host-neutral deterministic text analyzer，二者通过共享 semantic-source contract 组合。
- `@neko/entity-domain` analyzer 不监听文件、不打开 SQLite、不写 project facts；Desktop Main 只能通过 coordinator ports 提供文件、confirmed snapshot 和 projection commit。
- `@neko/search-domain` 只调度 eligible 创作文档；普通 JSON/YAML 和媒体文件不进入文本 analyzer。Entity/record 查询返回 compact occurrence relation，可见上下文由 Host 经 Content locator 回读。

### `@neko/ui`

`packages/ui` 是 React/Webview 公共 UI 层。

- 只拥有无业务 UI primitive、viewport/layout、foundation、keyboard/focus、hooks 和测试辅助。
- 不拥有 contribution registry、产品生命周期、宿主权限、媒体执行 operation 或 Agent runtime。
- `workbench` UI 是所有 Desktop scene 复用的 render-only layout primitive；它不得解释领域 Surface ref
  或成为第二套 runtime registry。Desktop 只通过 slot 组合
  package-owned Root，并复用同一 Workspace layout/style scope。
- 新增组件前先审计公共 primitive、同包 components/hooks/shared 和相邻保留包；跨两个以上 Webview 的无业务 UI 才适合提升到公共层。
- 生产 Renderer/Webview 不直接访问 Electron/Node 或建立本地 mock/fallback transport，应使用
  package-owned typed Desktop host port。

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

Desktop app-owned Canvas、Assets、Application Settings 与 Agent 业务 owner 已收敛到 package public
entry。Main 中保留的大型 runtime
是 Electron trust/resource adapter 与 package session composition，不构成领域实现先例；新增或触碰
时仍必须通过五层审计和 application boundary gate。

Desktop Window scene 与 PrimarySidebar projection 由 `@neko/host` 拥有。Desktop renderer 只将
validated Interaction/Main/Secondary Main/Manager/Timeline/Status refs 映射到 package public Root；
不得把 Asset/Extension management Root 放入 manager dock，不得让 Preview/Detail 取代 management
Main，也不得通过 active/first/recent Project fallback 决定 Workspace scope。目录授权只由 preload
投影 sender-bound opaque grant，raw path 不进入 renderer contract。

`@neko/agent-contracts` 拥有 closed conversation owner 与 canonical Agent Entry codec；
`@neko/agent-runtime` 从 immutable lifecycle context 产生 exact Assistant、Project、Dialogue、Room 或
World Experience owner；`@neko/host` 继续拥有既有 PrimarySidebar grouped navigation、排序和 identity
validation。Conversation/Creation 只出现在 Agent Entry：Creation 选择精确 Project 后把它加入 Composer
上下文栏而不导航；Conversation 使用全局 Character 精确版本多选和 World 精确版本单选，并允许组合选择。
Desktop Main 只组合 sender/Window、Workspace grant 与 concrete runtime，renderer 只发送 exact intent。
Project grouping、Agent Entry selection 或当前 scene 都不得成为 transcript、capability、memory 或 runtime owner。

文件发现边界：

- Assets 以用户全局 Media Library connection、项目 `.neko/media-libraries` target-free binding 和
  `neko/assets/<libraryName>` managed symlink/junction 共同构成授权链；link 只是可重建 Workspace
  access projection，不是业务 authority 或 project fact。`@neko/assets-domain` 拥有 binding/link policy，
  `@neko/assets-node` 拥有精确 connection resolution、link materialization、目录读取、containment、
  取消和生命周期，Desktop 只组合 native adapter。
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

| 子包                                | 职责                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@neko/agent-contracts`             | Agent/Main/preload/renderer contract、effective configuration、facts 和状态投影                                                |
| `@neko/agent-runtime`               | DSH Session application、Conversation binding、ACP event projection 与 host-neutral ports                                      |
| `@neko/automation-contracts`        | retained kernel：Browser/Computer provider、profile、exact target/session grant、action、evidence 与 diagnostic 的 L0 contract |
| `@neko/automation-node`             | retained kernel：自动化 session/target/mode/budget/approval policy、reviewed provider wrapper 与 transient observation 编排    |
| `@neko/ai-contracts`                | provider/model configuration contracts                                                                                         |
| `@neko/ai-sdk`                      | provider/AI SDK adapter                                                                                                        |
| `@neko/host`                        | Host settings、配置解析、credential/file port contract 与应用设置状态机                                                        |
| `@neko/agent-webview`               | DSH Session 与 Skill/MCP management 的 browser-only presentation；不拥有 Agent、Skill、MCP 或 Plugin runtime                   |
| `@neko/professional-apps-contracts` | 专业应用 profile、device-local binding、readiness、operation、handoff 与管理投影的 L0 canonical contract                       |
| `@neko/professional-apps-node`      | profile-gated discovery/config/launch/handoff application service；只消费窄 Host port，不依赖 Electron                         |
| `@neko/professional-apps-webview`   | 专业应用 catalog/configuration 的 browser-only presentation；不拥有应用、Skill、MCP、Job 或 OS authority                       |
| `@neko/chara-webview`               | Character、Dialogue 与 Chatroom 的 browser-only 产品视图和可丢弃展示状态                                                       |
| `@neko/world-webview`               | World 管理、目录创作、确定性 Runtime Workbench 与可丢弃展示状态；不实现完整 World Experience                                   |

Desktop 的产品级组合位于 `apps/neko-desktop`。Agent contracts/runtime 与 Host 不导入 Electron、React
或 Webview；Webview 不导入 Agent runtime、provider adapter 或 Desktop Main。DSH 独立子进程拥有
Agent/Session/Skill/MCP/Plugin authority，OpenNeko 只通过 package-owned ACP application port、typed domain
Tool bridge 与 Desktop trust adapter 协作。

附件输入只通过 ACP content block 进入 DSH。Host/Content/Media owner 负责 sender-bound 资源授权、字节读取、媒体预处理和 package-owned Tool contract；DSH attachment 当前拥有原生图片持久化。当前 Agent 模型是媒体语义理解的唯一 LLM authority，Renderer 只提交授权 resource identity；缺少所需模态时当前 submit/Tool call fail-visible，不切换 provider/model。产品不拥有第二媒体分析模型的 catalog/config owner。Generation 媒体模型/参数继续由其 owning package 独立管理，不能与 Agent 当前模型合并事实来源。

Browser Use 与 Computer Use 的控制实现由审核固定的开源 upstream MCP runtime 持有；OpenNeko 不实现
第二套浏览器、截图、键鼠输入、VLA 或 GUI Agent loop。`@neko/automation-contracts` 是 L0 canonical
shape owner，`@neko/automation-node` 是 L1 target、grant、action policy 与 evidence owner。两者作为官方维护的
DSH MCP contributions 接入：DSH 子进程拥有 MCP connection、Tool discovery/registration、call 与 cancellation；
OpenNeko 不保留 MCP Manager、generic Tool Registry 或 Pi Tool Call。`@neko/automation-node` 拥有目标发现、
脱敏候选、显式选择、选择后 exact revalidation 与一次性 grant 语义；Desktop Main 只提供 sender/Window-bound
用户选择 interaction adapter、当前 OS permission 查询、精确 app/process/window facts 与短生命周期 observation projection。
自动化 grant 必须绑定 exact provider/upstream release、browser profile 和 domains 或 computer target、
mode、timeout、step budget 与 conversation/run/toolCall owner；上游进程启动失败后也不得重放。Renderer
不得接收截图原始持久字节、真实 HOME/path、secret、process/window handle 或 MCP connection。

Entry Draft first-submit 的 context、initial message、pending intent、provider claim 和 session
materialization 顺序由 `@neko/agent-runtime` application service 拥有。Desktop 只注入精确
Assistant/Workspace runtime resolver；不得把 `workspace.createConversation` 隐藏在 provider adapter
中。Agent renderer adapter、preload 和 Main message route 必须携带同一显式 connection identity，
projection attachment 只能通过其创建时 binding 释放，不能使用全局 active connection 切换参数
模拟多个 session instance。

`@neko/shared/job-lifecycle` 只提供 typed Job identity、phase、revision/CAS、终态不可变和
versioned observation。Generation、Cut 等 owning domain 各自拥有 submit、具体 snapshot
schema、provider/executor identity、持久 migration、reconciliation、retry policy 和原子结果提交；
不得建立中央 `GenericJobManager`、共享 payload/result 表或跨领域 execution registry。Agent
只能通过 Tool Call 调用具体领域 port，Webview 只消费 Host-owned Activity projection，不拥有
Job 生命周期或 provider/executor observer。

所有媒体生成入口统一调用 `@neko/generation-domain` 的 public Job application port。Canvas、Cut、
Character、Agent Tool 和 Desktop 都是调用方；领域包不得通过 Agent chat 或 Desktop
`purposeMediaService` 或 Platform media service 转发生成。Host 解析 immutable effective
provider/model binding 并注入 port。调用方只保存 target/provenance 与 JobRef 的关联，通过
snapshot-first `observe(afterRevision)` 消费 commit 后事件，不直接轮询 provider。

用户可见“能力与集成”场景组合三种独立 authority：DSH Skill、DSH MCP 的只读投影，以及
Professional Applications 的 profile-gated device-local 投影；三者不得合并 contract、store、安装或
readiness 事实。DSH Plugin 只用于官方内部 composition，不进入产品 catalog。Generation、Canvas、Cut、
Assets、Character、World 等领域能力以精确 first-party DSH Tool contribution 接入，DSH 拥有 Tool call
lifecycle，owning package 拥有 schema、validation、authorization、事务、事实与 Job。不得建立第二套
Capability Host、generic Tool registry、MCP wrapper 或 External Processor。

## 主要领域包

| 包                          | 主要职责                                                                                              | 关键边界                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neko/agent-*`             | Agent session、provider、Skill、capability 与 Chat UI                                                 | runtime host-neutral；宿主与 UI adapter 分离；行为变更需真实 evaluation                                                                                                                                                                            |
| `@neko/generation-domain`   | canonical Recipe、生成请求/结果契约、execution port 与 recoverable Job                                | 统一拥有 Recipe/default/validation/request projection；只依赖共享契约；不读取配置或 credential；provider runtime 由现有 Host 注入；不创建独立 Host 或 UI                                                                                           |
| `@neko/chara-domain`        | 工作区 Character、全局 Character/不可变版本、同步、Dialogue/Room、表现、故事线与记忆                  | Project 只保存 membership 或精确全局版本引用；Assistant Creator 直接创建全局首版；运行只消费精确全局版本；单版本 ZIP 直接导入全局目录，不存在 installed/adaptation/recovery 生命周期                                                               |
| `@neko/world-domain`        | 工作区 World、全局 World/不可变版本、同步、World Run/Save/branch 与 World Experience                  | Project 只保存 membership 或精确全局版本引用；Assistant Creator 直接创建全局首版；Run/Save 固定精确版本；单版本 ZIP 直接导入全局目录，不存在 installed/adaptation/recovery 生命周期                                                                |
| `@neko/assets-*`            | Media Library 文件入口；显式本地 managed Asset manifest/lifecycle；Asset/Entity 资源投影              | 普通文件始终走 canonical locator/Host Content I/O，不因 discovery 入库；Asset package、revision/digest、dependency 与本地安装由 Assets package-owned public ports 管理，Desktop 只组合 Node/IPC adapter；Project Entity 走 canonical Entity facade |
| `@neko/text-editor-*`       | Workspace 文本文档 session、Markdown authoring catalog、Node media resolution 与 Source/Rich/Split UI | Domain 拥有精确 document/request/surface contract；Node 只通过注入 Workspace/Content port 解析候选和媒体；Webview 只消费 opaque URL；Desktop 仅做 sender/path 授权、IPC wiring 与 lease 投影                                                       |
| `@neko/canvas-*`            | 七类通用节点、空间布局、连接、投影与 `.nkc` authoring                                                 | Webview 管交互；持久化 Markdown/Media/Group/Job/File/CanvasEmbed/Generation wrapper 与三类连接；Generation wrapper 嵌入 `@neko/generation-domain` Recipe 但只拥有图关系、run/output binding 与选择；Job/Character/World runtime 外置；复用公共 UI  |
| `@neko/cut-*`               | Timeline、视频编辑、媒体控制与导出                                                                    | Webview 管时间线交互；Desktop Main 管 editor/export adapter；媒体走 `@neko/media` 窄端口                                                                                                                                                           |
| `@neko/preview-*`           | 授权只读预览与临时 3D Reference staging                                                               | Preview 拥有媒体 session 和面板级 Three.js 会话；Agent/Canvas/media 只消费共享 contract；不拥有持久 3D 项目                                                                                                                                        |
| `@neko/professional-apps-*` | 受产品 profile 约束的专业应用发现、device-local 配置、启动与语义 handoff                              | contracts/node/Webview 分层；Desktop 只实现 sender/OS/path trust adapter；应用检测不安装应用、Skill、MCP、节点或模型；ComfyUI API Job 仍由 Generation owner                                                                                        |
| `apps/neko-desktop`         | Electron 产品组合根                                                                                   | 拥有 Main/preload/renderer 生命周期、typed IPC、安全策略、平台打包与产品验收；领域实现仍由 `@neko/*` 包拥有                                                                                                                                        |

## Character / World 顶级领域聚合包

Character IP 与 Interactive World 是独立 bounded context，必须作为平级顶级领域包存在，不得嵌入
Agent、应用根或 Assets/Preview 内部：

| 包                                                                | 状态                                           | 聚合主线                                                                                            | 主要职责                                                                                                                                              | 关键边界                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neko/chara-domain` / `@neko/chara-node` / `@neko/chara-webview` | Foundation / Node adapter / browser UI         | `CharacterProject -> CharacterVersion + Storyline authoring + Companion continuity + Dialogue/Room` | 角色背景故事与原生背景设定、角色创作与发布、个人故事线创作、日常角色/关系记忆、Dialogue/Chatroom policy、上下文投影、持久化和 package-owned 产品视图  | 复用 Conversation + exact DSH Session binding；Narrative 不绑定外部 Composition/World/Save；Entity、Assets、Voice、Presentation、Media/Game 只通过公共 ref/port/provider 组合，Chara 不拥有外部 facts/runtime |
| `@neko/world-domain` / `@neko/world-node` / `@neko/world-webview` | Management / authoring / deterministic runtime | `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch`                                      | 世界书、事实、规则/事件、版本、运行、存档、分支与 WorldView；管理只读投影，目录创作保留 Workspace Primary Main，Runtime Workbench 消费 exact Run 投影 | 只通过精确 Character/Room binding 使用角色；世界局部状态不回写全局角色；创作预览不写 runtime，Foundation runtime 不得冒充 Story/Gameplay/Experience/实时 AI                                                   |

“顶级”指领域所有权，不指 concrete Composition Root。`apps/neko-desktop` 负责注入具体
Agent、Renderer、Device、表现 runtime 和 host adapter。Agent package 不导入 Character/World；
Character core 不导入 World 私有实现；运行期环境交互通过窄 port 或 host-owned adapter 组合。

角色拥有背景故事、原生背景设定、canon、个人成长弧、主观记忆、说话、动作、表情、移动意图、感知、
交互 affordance 和个体行为策略。`CharacterOriginSetting` 只是角色 lore，不是 WorldProject、WorldRun 或
WorldSave；共享地图和世界事件归 World Definition/Runtime，世界级冲突与章节进度归 World Story，作品内
玩法的目标、任务、战斗、经济、席位和胜负归 World Gameplay，外部游戏的同类事实归外部 Game authority。

角色互动产品可以按 `single-character | multi-character` topology 与 `dialogue | play` interaction
组合成单角色对话、多角色对话、单角色 Play 和多角色 Play 预设，但 Play 是 Agent 的通用参与能力，不是 Chara aggregate。Chara 只提供角色身份、策略、授权上下文与参与 ref。预设只组合共享 contract，不建立四套
session/controller。每个 agent-controlled character 映射独立 CharacterRun 和 primary
DSH Session；room 只共享带 actor/visibility/revision 的有序 event projection，不共享 responder、
transcript、模型配置或 memory view。human-controlled participant 不创建隐藏角色 Agent。

Agent Play 表示 Agent 代表角色或用户进行理解、规划、行动 proposal、代打、陪玩、观战或指导。`commentator` / `coach` 只读，
`co-player` / `delegate` 必须绑定明确 ActivitySession、seat 和 per-seat exclusive control lease；
同一 seat 不得由多个 Agent 并发输入。World 内创作玩法由 World Gameplay owner 拥有规则、状态、席位、动作验证和结果；外部游戏由外部 Game owner 拥有同类事实；
Desktop Host 拥有精确 app/process/window binding、OS 权限、授权 observation 与输入原语，Chara
只拥有角色参与策略、稳定 Activity ref 和经筛选的记忆候选，Agent Play 不拥有 Game state。Computer Use 只能作为显式、资格化、
有 step budget 且可 Pause/Stop/Take over 的 transport，不能在 adapter/API 失败后静默接管键鼠。

Play 的模型分工固定为：LLM/DSH Session 负责角色表达、规则理解、长期策略、协作、记忆和上下文
编排；VLA 或等价低延迟 control policy 负责实时游戏的短时 observation-to-action chunk；Game
World Gameplay 或外部 Game owner 负责 action/state/revision/outcome 验证。回合制策略游戏可以只用结构化 LLM
planning，实时动作游戏使用 VLA 短时闭环，多人游戏增加 seat/team/visibility 和 room coordination，
但都复用 Agent Play 的通用参与 contract 与各自 owner-qualified Game contract。

新游戏通过 canonical GameCapabilityProfile、规则/教程检索、安全校准、可选用户示范、有限 episode
试玩、结果验证和 retrieval/in-context experience 快速适应。Game-specific adapter 只表达目标、
observation/action/verification seam；Chara、Agent 和 Desktop 不得按游戏名称增加专用 controller，
常规接入不得要求重新训练基础模型。游戏经验属于 Game Activity 的可重建 projection，不得写入
CharacterVersion、relationship memory 或 Agent compaction。

角色创作、故事线、记忆与运行使用以下 canonical split：

```text
CharacterProject
  -> CharacterBackgroundStory + CharacterOriginSetting
  -> immutable CharacterVersion
  -> CharacterStoryline
       -> mutable CharacterStorylineDraft
       -> immutable CharacterStorylineVersion -> StorylineNode snapshots

userId + CharacterProjectId
  -> CompanionContinuity
       -> CharacterMemory
       -> UserCharacterRelationship

CharacterConversationSelection(companion | narrative)
  -> CharacterRun / Dialogue / Room
  -> one primary DSH Session per agent-controlled participant
```

`CharacterBackgroundStory` 描述角色个人历史，`CharacterOriginSetting` 描述角色原生时代、文化、
社会环境和角色视角下的背景认知；二者都随 CharacterVersion 发布，但不可运行、不可存档，也不得
转换成 WorldProject。CharacterStoryline 只拥有角色个人弧线的 identity、draft、不可变 publication 和
node authoring context；运行时只读 exact StorylineVersion/Node，不拥有 StorylineRun、transition、progress、
Save 或 branch。CompanionContinuity 分别拥有跨 Conversation 的角色主观记忆和用户—角色关系记忆；Narrative
不读取或写入该 continuity。

Character Narrative Dialogue/Room 是独立 Chara Conversation mode，不要求 WorldExperience、WorldRun、
Save、branch 或其他外部 Composition authority。外部 World/Game/Content 可以通过各自 owner-qualified
Presentation/context ref 与 Character 组合，但不得成为 Chara mode、Storyline 或 memory authority，也不得
通过 active/recent/latest identity 推断绑定。

两个聚合包内部必须保持以下依赖层级：

```text
core -> shared refs / domain values
application -> core + package-local consumer ports
adapters/agent -> application ports + public Agent contracts
adapters/chara|world -> public cross-domain contracts + owning ports
host-* -> public package entry + concrete host adapters
```

`core` 不得导入 Agent、Electron、React、Renderer、Device、表现 runtime、Media/Game Activity
或另一领域私有 runtime。应用 Host 只构造、注入和释放 adapter；Chara application service 拥有
Character authoring、Storyline publication/context、Companion continuity、Run、Room 和 relationship 编排；
OpenNeko Agent application 拥有 Conversation catalog/binding，DSH 拥有 turn/transcript/provider execution；外部 Context/Presentation、World、Activity
owner 拥有各自关联、事实、存档和执行。上述依赖必须通过 public/subpath exports 和
architecture test 强制执行，不能只依赖目录命名。

同一 agent-controlled CharacterRun 至多一个 primary DSH Session。Narrative participant 只绑定 exact
CharacterVersion 和可选 Storyline/Version/Node，并拥有独立 DSH Session/RoomView；不得绑定 CompanionContinuity
或由外部 owner 创建第二个 actor-level Character session。日常路径先解析稳定 CompanionContinuity，再把
有界角色/关系 memory view 物化给 exact primary DSH Session；多个 Conversation 不共享 mutable responder 或 transcript。

角色有效能力是 Host permission、workspace trust、CharacterVersion policy、CharacterRun scope、Conversation
mode 与对应 memory/context policy 的交集。任何层只能收窄授权，副作用
提交时由对应 owner 重验 permission、identity、revision 和 Approval。

Character 不直接写外部 store。Companion transcript、RoomEvent、Tool result、外部资料和 Activity result
只能以稳定 source ref 产生 CharacterMemoryCandidate 或 RelationshipMemoryCandidate；Chara owner 分别
接受、纠正、拒绝或删除。Storyline 修改只能进入显式 authoring candidate/draft/publication workflow，
运行输出不得产生 transition。CharacterVersion canon、CharacterStoryline、CompanionContinuity、
UserCharacterRelationship、DSH Session transcript 与外部存档必须保持独立。跨 scope 导入默认禁止；Device/Renderer/Media/Game live handle 和本机路径
不得进入持久 Character project、version、storyline 或 memory。

## 路径、缓存与用户数据

- 跨包与持久内容身份只使用 stable `ContentLocator`；entity/artifact/job/output ID 与 provenance 保持独立。不得并列保存 raw path、旧资源引用、provider URL、base64 或 Webview URI作为第二内容身份。
- owning package 可在文件操作参数中使用 workspace-relative path 或保留用途的 `${VAR}/path`；Host 派生缓存使用 cache-owned descriptor。二者都不得替代或反向污染跨包 `ContentLocator`。
- 本机绝对路径只允许存在于本机设置、临时运行时状态或明确 host adapter 内。
- Cache 是可重建派生数据，不能替代项目、Entity、ContentLocator、Generation/package owner 或 Agent 事实。
- 用户 secret 不写入项目文件、日志、Webview state、prompt 或 Skill。
- 跨包 mutation 通过 facade/port/command 和明确 error contract，不直接写另一个包的私有存储。

## Canvas 素材来源、生命周期与动作组合

Canvas 只拥有节点布局、连接和 durable projection，不拥有素材字节、媒体库 membership、
Generation recipe、viewer/editor 或 provider execution。素材进入 Canvas 固定为四条路径：

1. 普通工作区文件和项目授权媒体链接都保存 Workspace authority 的 canonical `ContentLocator`，
   文件内部内容使用可选 selector，引用时不复制字节；
2. 全局 Media Library 文件必须先由 Media Library owner 创建项目 binding 和匹配的 Workspace link，
   或由用户显式复制到项目可授权位置；
3. 任意工作区外文件由 Host 原子复制到 `neko/imports/<kind>/`，再用新的项目 locator 创建节点；
4. AI 素材先进入 Generation-owned draft/Job；owner 成功提交字节后返回 canonical Workspace
   `ContentLocator`，output identity、digest、Job 与 lineage 仍由 Generation 记录拥有。

素材地址只由 validated `ContentLocator.file` 与可选 selector 推导；素材是 referenced 还是 generated
由对应领域 authority/provenance 决定。扩展名、目录名、
provenance 文本、历史 prompt 和运行时 URL 都不得成为来源 authority。历史生成摘要只用于
展示；重新生成必须用稳定 `JobRef<'generation'>` 向 Generation owner 解析权威 recipe，
并创建新的 Job、output identity 和 lineage，不能覆盖旧结果。

Canvas selection toolbar 只投影 Host 在精确 project/Canvas session/request/selection 上解析出的
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
