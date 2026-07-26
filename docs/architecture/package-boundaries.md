# 包边界、公共层与运行平面

状态：Accepted

更新日期：2026-07-26
对应变更：`replace-cut-engine-with-node-ffmpeg-runtime`

本文定义当前保留 workspace 的依赖方向、公共能力 owner，以及 TUI、VS Code Extension/Webview 和 Node/FFmpeg 媒体运行时的边界。包名、入口和示例只描述当前保留实现；已移除产品不构成兼容要求。

## 分层与依赖方向

| 层级            | 主要包                                                                                                           | 可依赖                                  | 不得依赖                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| L0 host-neutral | `@neko/shared`、`@neko/proto`、`@neko/content`、`@neko/entity`、`@neko/search`、`@neko/markdown`、`@neko/skills` | 更低层纯 contract/utility               | VS Code、React、Webview、应用根、功能包内部实现               |
| L1 host/runtime | `@neko/host`、`@neko/media`、各功能包 host-neutral core/platform                                                | L0、明确 runtime dependency             | React/Webview 实现、`apps/*`、其他功能包内部实现              |
| L2 browser UI   | `@neko/ui`、功能包 Webview                                                                                       | L0、L2 公共 UI、包自有 contract         | `vscode`、Node-only API、Extension 实现、本地文件路径          |
| Extension Host  | 保留功能包的 Extension                                                                                            | L0/L1、VS Code API、包自有 host adapter | React/Webview implementation、其他功能扩展内部实现            |
| Application     | `apps/neko-tui`、`apps/neko-vscode`                                                                              | package public entries                  | `packages/*/src`、其他应用内部目录、应用级领域副本            |

依赖必须自上而下组合：

```text
apps
  -> public package entries
  -> host/domain contracts
  -> shared/proto

Webview -> UI/shared contracts
Extension -> host/domain/runtime contracts
Node media adapter -> FFmpeg/ffprobe process
```

任何跨层消息都先定义类型化 contract；任何跨包复用都走 public entry、port、facade command 或明确 adapter，不直接导入另一个包的内部实现。

## 公共包职责

### `@neko/shared`

`packages/neko-types` 是零依赖或低依赖基础能力 owner，包含 Logger、i18n、Theme、Errors、路径和 VS Code bridge 等分层公共入口。

- L0 入口不得导入 DOM、React、VS Code 或功能包。
- VS Code/Webview 专用能力只能从对应子路径暴露，不能污染通用入口。
- 功能包不得复制 package-local logger、i18n runtime、theme token、error 类型、path resolver 或项目文件 IO。

### `@neko/host`

`packages/neko-host` 提供 host-neutral application identity、project/file/config/credential 等宿主 port 和组合辅助。

- 具体 VS Code 或 Node/TUI adapter 在宿主边界实现。
- host-neutral core 不读取 VS Code API、DOM 或 Webview global。
- application identity 是路由契约，不会创建产品入口，也不能让已移除产品成功启动。

### `@neko/media`

`packages/neko-media` 提供领域中立的媒体契约，以及隔离的 Node 与浏览器
runtime 入口。

- 通用入口只包含 probe、prepared media、PCM、失败范围和生命周期契约。
- `@neko/media/node` 拥有 FFmpeg/ffprobe 进程与 opaque loopback
  Range/PCM session，不依赖 VS Code 或产品包。
- `@neko/media/browser` 拥有 MSE/PCM client，不访问 Node、VS Code 或本地路径。
- Preview、Canvas、Tools、Agent、Assets 与 Cut 必须通过各自的窄领域端口组合
  这些能力，不得重新创建宽泛 `EngineClient` facade。

### `@neko/proto`

`packages/neko-proto` 是需要持久或跨语言生成的 wire contract 单一事实来源。Node 媒体 session descriptor 由 `@neko/media` 维护；功能包不得手写平行协议。

### `@neko/content`

`packages/neko-content` 拥有文档解析、locator/range、entry ref、图片元数据探测和格式识别等跨领域内容语义。

- 通过 runtime deps 注入文本、二进制和 container 读取能力。
- 不管理 cache root、Webview URI、Engine token、workspace 生命周期或 UI 状态。
- Agent 和领域包复用公共入口，不重新实现 document reader/cache/path/media catalog。
- 文本实体分析复用 `DocumentAccessService` manifest/cursor/range：PDF page、EPUB chapter、DOCX section/paragraph 的正文只在 transient analysis batch 中存在；Content 返回 locator、hash 与 `ResourceRef`，不拥有 SQLite projection。

### `@neko/entity` 与 `@neko/search`

实体和搜索是 host-neutral 跨领域服务。

- core/projection 通过 port 注入文件、锁、日志和事件能力，不依赖 VS Code、React 或功能包内部实现。
- Assets 是当前 VS Code Entity runtime、Entity Browser、metadata binding 和 Inspector 的宿主 owner。
- Canvas、Assets 和 Agent 通过 canonical facade/contract 访问 Entity；不存在 Dashboard fallback。
- projection 不泄露 store/cache/index 绝对路径、token、Webview URI 或 manifest path。
- `@neko/search` 的 semantic source coordinator 拥有 source scope、fingerprint、freshness、reconciliation 和 analyzer scheduling；`@neko/entity` 提供 host-neutral deterministic text analyzer，二者通过共享 semantic-source contract 组合。
- `@neko/entity` analyzer 不监听文件、不打开 SQLite、不写 project facts；VS Code/TUI Host 只能通过 coordinator ports 提供文件、confirmed snapshot 和 projection commit。
- `@neko/search` 只调度 eligible 创作文档；普通 JSON/YAML 和媒体文件不进入文本 analyzer。Entity/record 查询返回 compact occurrence relation，可见上下文由 Host 经 Content locator 回读。

### `@neko/ui`

`packages/neko-ui` 是 React/Webview 公共 UI 层。

- 只拥有无业务 UI primitive、viewport/layout、foundation、keyboard/focus、hooks 和测试辅助。
- 不拥有 contribution registry、产品生命周期、宿主权限、Engine operation 或 Agent runtime。
- `workbench` UI 若保留，只是 render-only primitive；它不得依赖已移除 Workbench Core，也不得成为第二套 runtime registry。
- 新增组件前先审计公共 primitive、同包 components/hooks/shared 和相邻保留包；跨两个以上 Webview 的无业务 UI 才适合提升到公共层。
- 生产 Webview 不直接调用 `acquireVsCodeApi()` 或建立本地 mock/fallback bridge，应复用共享 typed facade。

## 组合包已移除

`@neko/workbench-core` 和 `@neko/market-core` 不在 workspace 中。保留 Canvas、Cut、Agent 和 Preview Webview 直接暴露 package-owned host adapter；应用根显式组合这些公共入口。

不得通过 TypeScript alias、空 package、legacy export、动态 optional import 或成功 no-op 恢复已移除组合层。未来出现两个以上真实、同生命周期、同错误模型的复用点时，应先通过 OpenSpec 定义新的中立 contract，而不是复活旧包。

## Extension Host

Extension 包拥有 VS Code 宿主能力：

- 注册 commands、Custom Editors、providers、status bar 和 disposables；
- 通过 `webview.asWebviewUri()` 投影资源，并用类型化 `postMessage` bridge 通信；
- 授权 loopback token、file root、stream descriptor 和 preview resource；
- 通过领域窄 port 编排 `@neko/media/node` 操作；
- 在 deactivate、editor close 和取消路径显式释放资源。

Extension 不导入 React，不复制媒体计算，不直接依赖其他功能扩展内部实现，也不中继高频视频帧或 PCM。

文件发现边界：

- Assets Extension 从 `neko/assets/<libraryName>` direct links 派生授权 root，并负责 watcher、trust、Host path guard、目录读取、取消和生命周期；不存在 target settings registry。
- 文件事件只触发 host-neutral coordinator；发现文件不得创建 Entity/binding、写 catalog 或分配文件 identity。
- semantic/entity projection 使用 `LocalMetadataStore` 的用户级 SQLite binding；Webview 和功能包不接收数据库路径或 raw SQL。

## Webview

Webview 负责浏览器沙箱内的 UI、用户交互和可恢复展示状态。

- 可以使用 React、Zustand、`@neko/ui`、共享 Webview facade 和包自有 components/hooks。
- 不能导入 `vscode`、`node:*`、`fs`、`path` 或 Extension 实现。
- 不能直接读写 workspace、持久项目事实、SecretStorage 或 Engine 进程状态。
- token、blob URL、stream handle 和 Webview URI 只能是短生命周期投影，不能写回项目文件。
- 媒体入口必须遵守 CSP、codec 和 Range 边界；错误应展示明确 diagnostic，不伪装成功。

涉及视觉、交互、CSP、焦点、消息或媒体的验收必须运行 Extension Development Host；普通浏览器只适合纯浏览器兼容辅助。

## Node/FFmpeg 媒体运行时

`packages/neko-engine` 与 `packages/neko-client` 已删除。当前媒体边界由
`@neko/media`、领域 port 和 FFmpeg adapter 组成；不存在 Engine fallback。

- H.264/Range、MSE、PCM、抽帧、波形、转码和导出遵循
  [`media-runtime.md`](media-runtime.md)。
- OTIO、Canvas 文档、Agent 会话和其他项目事实由 owning domain 持有，FFmpeg
  只是有界执行 adapter。
- 新媒体能力先更新中立 contract，再接 owning package adapter 和真实 Webview
  路径测试；不得恢复 Engine route/client/DTO。

## Agent 子包

`packages/neko-agent` 内部继续按职责分层：

| 子包          | 职责                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `agent-types` | Agent/Webview/Extension contract 和状态投影                                                                                       |
| `agent`       | Pi product runtime、conversation identity、permission、Skill Host、Capability Tool bridge 与 Agent evaluation；不拥有领域 Quality |
| `ai-sdk`      | provider/AI SDK adapter                                                                                                           |
| `platform`    | 迁移中的 host-neutral config/media 集成层；不得作为 `config/tools/prompts/media` manager bag，目标按 owner 拆分                   |
| `extension`   | VS Code command、配置桥、host adapter、会话入口                                                                                   |
| `webview`     | Chat/Agent UI、消息投影和用户输入                                                                                                 |
| `test-utils`  | 测试支撑                                                                                                                          |

TUI 的产品级组合位于 `apps/neko-tui`。Agent core/platform 不导入 VS Code、React 或 Webview；Webview 不导入 Agent runtime、provider adapter 或 Extension API。Prompt、Skill、capability/tool schema 和宿主副作用按各自边界维护。Pi 只接收已经解析好的 model/prompt/tool snapshot，不接收 `ConfigManager`、领域 service 或 Host process adapter。

`@neko/shared/job-lifecycle` 只提供 typed Job identity、phase、revision/CAS、终态不可变和
versioned observation。Generation、Cut 等 owning domain 各自拥有 submit、具体 snapshot
schema、provider/Engine identity、持久 migration、reconciliation、retry policy 和原子结果提交；
不得建立中央 `GenericJobManager`、共享 payload/result 表或跨领域 execution registry。Agent
只能通过 Tool Call 调用具体领域 port，Webview 只消费 Host-owned Activity projection，不拥有
Job 生命周期或 provider/Engine observer。

所有媒体生成入口统一调用 `@neko/generation` 的 public Job application port。Canvas、Cut、
Character、Agent Tool 和 TUI 都是调用方；领域包不得通过 Agent chat、Agent Extension
`purposeMediaService` 或 Platform media service 转发生成。Host 解析 immutable effective
provider/model binding 并注入 port。调用方只保存 target/provenance 与 JobRef 的关联，通过
snapshot-first `observe(afterRevision)` 消费 commit 后事件，不直接轮询 provider。

Agent 运行身份只保留前台 Agent Run 和显式 SubagentRun。独立 BackgroundAgentRun 没有生产
owner，不进入 runtime、协议或 UI；未来若出现真实独立需求，必须重新建立 OpenSpec。

Quality 的边界由 [`adr-agent-runtime-single-authority-and-simplification-boundary.md`](adr-agent-runtime-single-authority-and-simplification-boundary.md) 定义：`@neko/quality` 已建立为中立 runtime，拥有 canonical contract validation、evidence freshness、Gate aggregation、evaluator port、provider-neutral model adapter 和通用 ProjectQuality facade orchestration；owning package 继续拥有领域 rubric、目标 materialization、确定性检查、Gate policy、repair 和 apply。跨包 contract 暂留 `@neko/shared`；Agent Extension 只保留 Tool/Capability、purpose-model 和授权资源 materializer 适配。

Capability 是 OpenNeko 产品扩展 seam，领域包提供定义，Host 负责 discovery/trust/lifecycle，Pi bridge 只投影当前 turn 的不可变 Tool snapshot。External Processor 不是 Pi 或平行 Capability 系统；它只能作为 Host 中受管、可取消的 Tool implementation，并继续遵守路径、资源、环境、网络、审批和用户数据边界。

## 保留领域包

| 包                 | 主要职责                                              | 关键边界                                                                                                                                       |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `neko-agent`       | Agent session、provider、Skill、capability 与 Chat UI | runtime host-neutral；宿主与 UI adapter 分离；行为变更需真实 evaluation                                                                        |
| `neko-generation`  | 生成请求/结果契约、execution port 与 recoverable Job  | 只依赖共享契约；不读取配置或 credential；provider runtime 由现有 Host 注入；不创建独立 Host、Extension 或 Webview                              |
| `neko-chara`       | Character Dialogue、Embody、角色证据与角色运行编排    | core/application host-neutral；VS Code 依赖只在 `host-vscode`；只消费 Agent contract，不拥有第二套 Agent loop                                  |
| `neko-quality`     | canonical Quality Gate、evaluator port 与模型证据适配 | 只依赖共享 contract；领域 rubric/repair/apply 留在 owning package；provider/config/credential 和 Host IO 由组合层注入                          |
| `neko-assets`      | Media Library 文件入口、投影和 Entity VS Code surface | 文件走 canonical locator/Host Content I/O；Entity 走 canonical facade；不拥有 catalog、package/generated lifecycle 或 cache                    |
| `neko-canvas`      | 画布、创作结构、投影与领域 authoring                  | Webview 管交互；持久写入走 domain/host contract；复用公共 UI                                                                                   |
| `neko-cut`         | Timeline、视频编辑、媒体控制与导出                    | Webview 管时间线交互；Extension 管 editor/export；媒体走 `@neko/media` 窄端口                                                                  |
| `neko-preview`     | 授权只读预览与临时 3D Reference staging               | Preview 拥有媒体 session 和面板级 Three.js 会话；Agent/Canvas/media 只消费共享 contract；不拥有持久 3D 项目                                      |
| `neko-tools`       | 工具、Media LSP、差异与诊断                           | LSP/diagnostic 在 Extension；不得贡献已移除 Device UI                                                                                          |
| `apps/neko-vscode` | VS Code 产品组合根                                    | 拥有单一安装扩展的组合生命周期、scoped context、manifest 合并、平台打包、发布和产品验收；领域实现仍由各 `neko-*` 包拥有                        |

## Character / World 顶级领域聚合包

Character IP 与 Interactive World 已确定为独立 bounded context，必须作为平级顶级领域包存在，不得嵌入 `neko-agent`、应用根或现有 Assets/Preview 内部。`neko-chara` 已完成第一阶段 owner 迁移；`neko-world` 仍未实现：

| 包           | 状态           | 聚合主线                                                       | 主要职责                                                                                                          | 关键边界                                                                                                            |
| ------------ | -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `neko-chara` | 第一阶段已建立 | `CharacterProject -> CharacterVersion -> CharacterRun`         | 当前已拥有 Character Dialogue、Embody、角色证据、Profile Assembly 和 VS Code 角色编排；项目/版本/发布仍待后续实现 | 完全复用 `neko-agent`/Pi；Entity、Assets、Voice、2D/3D、Device/Perception、Engine 只通过公共 ref/port/provider 组合 |
| `neko-world` | 拟议           | `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay` | 世界事实、规则/事件、Gameplay、运行、存档、分支和回放                                                             | 只通过 CharacterVersion/WorldCharacterBinding 使用角色；世界局部状态不回写全局角色；不以 Agent/UI 状态代替世界事实  |

“顶级”指领域所有权，不指 concrete Composition Root。`apps/neko-desktop`、`apps/neko-vscode` 或其他宿主负责注入具体 Agent、Renderer、Device、Engine 和 host adapter。`neko-agent` 不导入 Character/World；Character core 不导入 World 私有实现；运行期环境交互通过窄 port 或 host-owned adapter 组合。

角色只拥有说话、动作、表情、移动意图、感知、交互 affordance 和个体行为策略；地图、目标、任务、战斗、经济、成长、事件调度和整体胜负状态归 World。当前缺失的 Character Project/Version、World、Device/Live、Scene/Puppet 和持久 2D/3D 路径必须保持 fail-visible，不能因为第一阶段 package 已建立就恢复旧实现或宣称支持。

两个聚合包内部必须保持以下依赖层级：

```text
core -> shared refs / domain values
application -> core + package-local consumer ports
adapters/agent -> application ports + public Agent contracts
adapters/chara|world -> public cross-domain contracts + owning ports
host-* -> public package entry + concrete host adapters
```

`core` 不得导入 Agent、VS Code、React、Renderer、Device、Engine 或另一领域私有 runtime。应用 Host 只构造、注入和释放 adapter；Character/World application service 分别拥有 run、turn/action、memory candidate、event/save/replay 编排。上述依赖必须通过 public/subpath exports 和 architecture test 强制执行，不能只依赖目录命名。

同一 published character actor 的运行路径固定为 `WorldActorInstance -> CharacterRun -> primary AgentSession`，World 不得再创建第二个 actor-level session；Ambient NPC 和 World Director 使用独立显式 scope。有效能力固定为 Host permission、workspace trust、Character policy、World binding policy 与 run scope 的交集，副作用提交时由 owner 重验 permission、identity、revision 和 Approval。

Character 不直接写 World store；跨域 mutation 必须通过显式 world run/actor/action identity 与 expected revision 的 WorldAction contract，由 World runtime 原子提交 WorldEvent/revision 或返回 typed rejection。CharacterVersion、CharacterRun、WorldSave 与 Memory infrastructure 的事实/派生边界必须保持独立，Device/Renderer/Engine live handle 和本机路径不得进入持久项目、版本或存档。

## 拟议顶级领域聚合包

Character IP 与 Interactive World 已确定为独立 bounded context，但当前 workspace 尚无已接受实现。后续实施必须创建平级顶级领域包，不得嵌入 `neko-agent`、应用根或现有 Assets/Preview 内部：

| 拟议包 | 聚合主线 | 主要职责 | 关键边界 |
| --- | --- | --- | --- |
| `neko-chara` | `CharacterProject -> CharacterVersion -> CharacterRun` | 角色 IP、发布版本、Roleplay、记忆/能力策略、表现绑定和角色运行 | 完全复用 `neko-agent`/Pi；Entity、Assets、Voice、2D/3D、Device/Perception、Engine 只通过公共 ref/port/provider 组合 |
| `neko-world` | `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay` | 世界事实、规则/事件、Gameplay、运行、存档、分支和回放 | 只通过 CharacterVersion/WorldCharacterBinding 使用角色；世界局部状态不回写全局角色；不以 Agent/UI 状态代替世界事实 |

“顶级”指领域所有权，不指 concrete Composition Root。`apps/neko-desktop`、`apps/neko-vscode` 或其他宿主负责注入具体 Agent、Renderer、Device、Engine 和 host adapter。`neko-agent` 不导入 Character/World；Character core 不导入 World 私有实现；运行期环境交互通过窄 port 或 host-owned adapter 组合。

角色只拥有说话、动作、表情、移动意图、感知、交互 affordance 和个体行为策略；地图、目标、任务、战斗、经济、成长、事件调度和整体胜负状态归 World。当前缺失的 Character/World、Device/Live、Scene/Puppet 和持久 2D/3D 路径必须保持 fail-visible，不能因为本节命名了目标包就恢复旧实现或宣称支持。

两个聚合包内部必须保持以下依赖层级：

```text
core -> shared refs / domain values
application -> core + package-local consumer ports
adapters/agent -> application ports + public Agent contracts
adapters/chara|world -> public cross-domain contracts + owning ports
host-* -> public package entry + concrete host adapters
```

`core` 不得导入 Agent、VS Code、React、Renderer、Device、Engine 或另一领域私有 runtime。应用 Host 只构造、注入和释放 adapter；Character/World application service 分别拥有 run、turn/action、memory candidate、event/save/replay 编排。上述依赖必须通过 public/subpath exports 和 architecture test 强制执行，不能只依赖目录命名。

同一 published character actor 的运行路径固定为 `WorldActorInstance -> CharacterRun -> primary AgentSession`，World 不得再创建第二个 actor-level session；Ambient NPC 和 World Director 使用独立显式 scope。有效能力固定为 Host permission、workspace trust、Character policy、World binding policy 与 run scope 的交集，副作用提交时由 owner 重验 permission、identity、revision 和 Approval。

Character 不直接写 World store；跨域 mutation 必须通过显式 world run/actor/action identity 与 expected revision 的 WorldAction contract，由 World runtime 原子提交 WorldEvent/revision 或返回 typed rejection。CharacterVersion、CharacterRun、WorldSave 与 Memory infrastructure 的事实/派生边界必须保持独立，Device/Renderer/Engine live handle 和本机路径不得进入持久项目、版本或存档。

## 路径、缓存与用户数据

- Generation Job、Agent creator-visible artifact、Workspace Board 与其 Canvas 投影只使用 stable `ContentLocator` 传递内容位置；entity/artifact/job/output ID 与 provenance 保持独立。不得并列保存 raw path、`ResourceRef`、provider URL、base64 或 Webview URI。
- 其他尚未迁移的领域可继续使用其已接受的 workspace-relative path、保留用途的 `${VAR}/path` 或 `ResourceRef`；Host 派生缓存也可保留内部 `ResourceRef`，但不得反向进入上述 creator-visible canonical path。
- 本机绝对路径只允许存在于本机设置、临时运行时状态或明确 host adapter 内。
- Cache 是可重建派生数据，不能替代项目、Entity、Media Library locator、generated/package owner 或 Agent 事实。
- 用户 secret 不写入项目文件、日志、Webview state、prompt 或 Skill。
- 跨包 mutation 通过 facade/port/command 和明确 error contract，不直接写另一个包的私有存储。

## 验证命令

按改动影响范围组合运行：

```bash
pnpm check:deps
pnpm check:agent-boundaries
pnpm check:legacy-debt
pnpm check:unused
pnpm test
pnpm build
pnpm smoke:webview:targets
pnpm --dir packages/neko-media test:run
```

Webview 运行态验收不进入 CI；通过 Extension Development Host 与 `vscode-extension-debugger` 在本地执行。场景由 owning package 维护业务 fixture 和断言，证据只能使用隔离合成 workspace，并按仓库规则脱敏。
