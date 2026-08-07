# AGENTS.md

## 适用范围

- 本文件作用于仓库根目录及其所有子目录。
- 若系统、开发者或用户指令与本文件冲突，以更高优先级指令为准。
- 若子目录存在更具体的 `AGENTS.md`，其规则在对应目录范围内补充本文件；子目录规则可以细化包级要求，但不得静默放松本文件的架构、安全、用户数据保护和 fail-visible 硬约束。

## 规则强度

- “必须 / 不得 / 禁止”表示硬约束；违反时不得声明任务完成。
- “应 / 不应”表示默认要求；偏离时必须说明原因和风险。
- “优先”表示必须先完成审计和比较，但不代表必须采用。
- “推荐”表示非阻塞建议；示例和常用命令不自动构成对所有改动的强制要求。

## 工作方式

- 以架构师视角工作：遵循 SOLID、自顶向下设计、契约优先实现。
- 修改前先回答三个问题：
  1. 是否符合现有架构？
  2. 如何进一步降低耦合？
  3. 是否易于扩展与测试？
- 非平凡功能、跨模块修改、公共契约或架构变更，实施前必须按 `openspec/config.yaml` 的 workflow 在 `openspec/changes/<change>/` 创建或更新 OpenSpec artifacts；proposal、design、spec 和 tasks 是实施约束，不是事后补写的文档。
- 遇到多模块改动或新功能，先做五层分析：职责、依赖、接口、扩展、测试。
- 分析必须覆盖完整调用链和真实运行边界，不能只优化当前文件、当前函数或单个测试暴露出的局部现象；先确认输入、状态、契约、依赖、资源生命周期、错误传播和最终用户路径，再决定修改位置。
- 抽象只服务于稳定职责、真实边界或明确变化点：接口应精简、可组合、可替换、可测试，不要为单一实现制造无意义层级，也不要为了少写代码把不同职责压进同一接口。
- 简单改动可直接实现，但仍需保持与现有架构一致。
- 本项目是本地 Electron Desktop + Node/FFmpeg 媒体运行时，不是云端多租户或分布式后端；设计必须按本地产品边界控制复杂度，避免为了假想远程规模、租户隔离、服务治理或未知未来需求引入过度抽象、过度配置、过度防御或多层 indirection。
- 防御性代码只保护真实边界：Electron Main/preload/renderer 隔离、CSP、typed IPC、本地文件与路径、媒体 codec/Range、异步取消与资源释放、外部 AI/market provider、用户数据和安全/信任边界；不要用宽泛 try/catch、静默默认值、fallback、重复校验或 no-op guard 掩盖本应暴露的开发错误。
- 默认采用 fail-visible 且 fail-local：契约违背、不可达状态、未实现路径、缺失依赖、非法 message、无法解析的 schema 或开发期路径错误应在最小 owning boundary 直接抛错、返回明确 diagnostic 或让测试失败，同时保持无关记录、实例、能力和工作区可用；除非保护用户数据、外部 provider 或安全/信任边界，不要用兜底值、兼容分支或静默降级把代码问题伪装成成功。安全或信任边界必须拒绝当前请求或资源，不得因此默认停用整个应用。
- 旧参数、持久化数据或可恢复状态失效时，必须在最小 owning scope 内恢复：非 authoritative 的参数、选择、布局和展示状态只重置对应记录、实例、页面或组件到当前 canonical 默认状态，并返回可观测 diagnostic；项目事实、用户内容和组件 authoritative data 不得伪造默认值或静默覆盖原数据，必须保留原数据并在对应项目、记录或组件位置显示失效状态和修复入口。局部失效不得冒泡为组合根、全局 error boundary、workspace registry 或应用启动失败，不得阻止用户访问其他项目、组件和功能；局部默认状态是当前契约的正常 fresh state，不得借此实现旧数据 fallback、兼容读取或迁移。
- 新增功能或非平凡代码修改后，按本文“测试与质量门禁”章节和 `CONTRIBUTING_CN.md` 做自审；可使用项目 skill `.codex/skills/neko-quality-review/SKILL.md`，并在交付说明中列出验证命令与剩余风险。

## 语言与沟通

- 面向用户的说明优先使用中文。
- 力求回答简洁明确、结论优先，输出长度应与任务复杂度匹配；过度输出视为对需求理解或问题解决存在偏差。
- 不要复述用户需求、重复总结同一结论或展开无关背景；能用少量段落或列表说明时，不生成多章节长篇报告。
- 非平凡开发任务的交付说明默认收敛为：变更摘要、关键设计、验证结果、剩余风险；仅在用户明确要求详细分析、方案对比、审计报告或教程时展开。
- 过程更新只说明当前阶段、关键发现和阻塞项；没有新增信息时不要重复汇报。
- 新增代码注释应优先遵循所在模块既有风格；若无明确先例，使用简洁英文注释说明非显然约束。
- 文档更新优先同步中文版本；若变更影响英文文档语义，补充对应英文文档。

## 项目概览

- 本仓库是 `OpenNeko`，一个本地优先的 Electron Desktop 创意工作套件 monorepo。
- 主要技术栈：
  - 前端：React 18、Zustand、Tailwind CSS、Vite
  - Desktop：Electron Main/preload/renderer、TypeScript、Vite
  - 媒体运行时：Node.js + FFmpeg/ffprobe、loopback Range/PCM
  - AI：Vercel AI SDK + MCP Protocol
  - 类型契约：TypeScript package-owned contracts 与领域 codec
  - 构建：pnpm 10 workspace
  - 测试：Vitest、Node.js test runner、真实 Electron 场景
- 共享基础核心包：
  - `packages/shared`：共享基础设施（Logger、i18n、Theme、Errors）
  - `packages/media`：Node/FFmpeg 与浏览器媒体运行时
  - package-owned L0 contracts：Desktop Main/preload/renderer 跨 runtime 类型契约
- 保留能力和业务逻辑均由 `packages/*` 或 `packages/*/*` canonical workspace 拥有；`apps/neko-desktop` 是唯一、薄的
  Electron 应用组合根，只负责产品入口、信任边界、concrete adapter 与 wiring。完整边界见
  `docs/architecture/application-composition.md` 和 `docs/architecture/package-boundaries.md`。

## 开发前先读

- 功能背景先看 `README_CN.md`，必要时对照 `README.md`。
- 总体架构先看 `docs/architecture/README.md` 与 `docs/architecture/package-boundaries.md`。
- 文档导航先看 `docs/README.md`，不要猜测具体文档路径。
- 系统级架构、ADR 和跨领域约束从 `docs/architecture/README.md` 进入。
- 子包边界、UI 层、公共代码、Desktop IPC 与 Node/FFmpeg 约束先看 `docs/architecture/package-boundaries.md`。
- 领域能力、领域架构和跨包领域边界从 `docs/domains/README.md` 进入，再进入 `docs/domains/<domain>/README.md`。
- 调研、竞品、技术 spike 和 UX 分析从 `docs/research/README.md` 进入。
- Gap、迁移、健康度和审计快照从 `docs/status/README.md` 进入。
- 活跃设计变更优先查 `openspec/changes/`。
- 当前代码是实际行为的事实来源，根架构和已接受 ADR 是目标约束来源；两者或包级文档发生冲突时，不得默认用现有实现合理化架构漂移，应检查活跃 OpenSpec、迁移状态和已知债务，判断应修复代码、更新文档还是继续既定变更，并在设计或交付说明中记录结论。

## 文档治理

- 根目录 `README_CN.md` / `README.md` 是项目入口；`docs/architecture/README.md` 是系统架构总览入口。
- `docs/architecture/` 只放系统级约束、ADR 和跨领域不变量。
- `docs/domains/<domain>/` 放领域能力模型、领域数据流和领域内部架构；领域架构文件命名为 `architecture.md`。
- `docs/research/` 放调研、竞品、市场、技术 spike 和 UX 分析；此类文档必须带日期、来源或不确定性说明。
- `docs/status/` 放带日期的 gap、迁移进度、健康度和审计快照；此类文档不作为长期架构事实来源，也不承担任务管理。
- `openspec/changes/` 放仍在设计或实施中的变更；稳定结论再提升到 `docs/architecture/` 或 `docs/domains/`。
- `packages/<name>/docs/` 或 `packages/<family>/<role>/docs/` 放只服务某个包的实现、配置和维护说明。
- 新增或移动文档前，先判断它是系统约束、领域模型、调研分析、当前状态、开发变更还是包私有实现。
- 不要把领域内部架构放入 `docs/architecture/<domain>/`；应放入 `docs/domains/<domain>/architecture.md`。
- 不要把实现日志、命令输出、阶段完成记录或临时状态写成架构事实。
- 状态文档中的行动项需要设计、实现或验收时，转入 `openspec/changes/`；只是排队事项时，转入 `TODO_CN.md` / `TODO.md`；长期方向转入 `ROADMAP_CN.md` / `ROADMAP.md`。

## 架构硬约束

- TypeScript 不要放松以下编译约束：`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`。
- 禁止内部无意义的版本化。生产代码、内部 contract、DTO、message/event/command、IPC、schema、codec、配置、索引、缓存和内部元数据不得为了未来兼容、升级预留、数据迁移、缓存失效、调试便利或“行业惯例”新增 `version`、`schemaVersion`、`formatVersion`、`contractVersion`、用于表达内部数据代际的 `revision`/`generation`/`epoch`、migration marker、数字版本后缀或语义等价别名，也不得据此切换内部 shape、路由新旧路径或判定数据有效性。
- 必须保留用户需要管理的领域版本数据。Character、素材以及其他用户创作对象只要存在用户可见的创建版本、历史、引用、比较、恢复、发布或删除语义，就应由 owning domain 定义明确的版本 identity、不可变内容和生命周期，并允许对应 contract/UI 原样传递和管理；此类版本是业务事实，不是 schema、component、contract 或迁移版本，不得被解释为内部 format dispatch。
- 必须保留第三方版本。第三方服务、库、API、协议、模型、文件格式和工具链要求或公开提供的版本号、依赖约束、版本化 endpoint/参数及原始标识应保留在 lockfile、manifest、provider-specific config/contract 和边界 adapter 中，不得为了内部“无版本”规则删除、伪造或丢失；它们可以参与对应第三方调用和兼容性判断，但不得扩展为无关领域数据的 identity、内部 schema 代际或全局版本路由。
- 除用户管理的领域版本和第三方版本外，内部版本字段只有在存在可验证的真实正确性消费者时才允许，例如不可替代的并发控制/CAS token；引入前必须在 OpenSpec、PR 或交付说明中写明 owner、消费者、正确性不变量、为何无版本设计不可行和移除条件。没有明确消费者，或仅服务迁移、兼容、预留和调试时，一律禁止。
- Renderer 沙箱限制必须遵守：
  - Renderer/Webview 包不能直接访问 Node.js 或 Electron API。
  - 宿主能力只能通过 preload 暴露的最小 typed Desktop port 使用。
  - 本地资源必须由 Desktop Main 授权，并以 opaque URL、descriptor 或短生命周期 handle 投影。
- Renderer/Webview 包负责 UI 渲染、用户交互、可恢复展示状态、浏览器图形/GPU 能力和授权媒体流消费；不得拥有工作区文件读写、持久项目事实、权限与信任、后台任务生命周期、运行时实例状态或宿主业务编排。
- Desktop Main 负责 Electron trust boundary，以及工作区 IO、持久化、凭据、进程和窗口的 concrete
  Host adapter 与资源生命周期；业务编排、领域状态和规则由 owning package 的 host-neutral/Node
  application service 负责，不得堆入应用组合根。
- Node/FFmpeg 媒体运行时负责宿主侧媒体探测、转码与流式读取；TypeScript owning packages 负责领域模型与编排，Renderer 不得重复实现宿主媒体逻辑。
- 当前没有 Proto package；跨层 contract 由 owning package 的 L0 contract 或真实项目 codec 拥有。未来只有存在真实序列化 producer/consumer 时才可通过 OpenSpec 重新引入 Proto。
- 禁止内部 contract 版本化。用户管理的领域版本可以作为业务 identity/ref 在 owning domain contract 中原样传递，第三方版本可以保留在 provider-specific contract 和边界 adapter 中，但两者都不得作为内部 contract、schema 或 codec shape 的判别字段。package-owned internal contract、public port、IPC/message、DTO、codec、schema、event 和 command 不得声明 contract/schema generation，不得建立内部 `v1`/`v2` 类型、版本化 channel/handler、按版本分发的 registry 或新旧 contract 并行路径。内部 Contract 必须保持单一 canonical shape；变更时必须一次性更新本次边界内全部 producer、consumer、fixture 和测试，并删除旧 shape 与旧路径。
- Contract 失效必须隔离在最小可判定范围，优先为单次 message/event/command 或单条记录，其次为单个实例、sender、session 或能力；只能拒绝受影响的输入或操作并返回明确 diagnostic，不得因一个 contract decode、validation、registration 或 handler 失败而使其他 contract、组件、项目、工作区或整个应用不可用。Contract registry、组合根和批量加载路径必须支持逐项隔离失败，不得用全局初始化失败、清空共享状态或统一 disable 传播局部 contract 错误。
- Contract 测试必须覆盖生产者与消费者使用同一 canonical shape、代码中不存在内部 contract 版本字段和版本分发路径、合法的用户领域版本与第三方版本不会被删除或改写，以及单个非法 contract 输入被拒绝时无关 contract、实例、能力、工作区和应用仍可正常使用；涉及 Electron trust boundary 时必须额外断言仅当前请求、sender 或授权资源 fail-closed。
- 禁止内部代码多路径。同一业务意图在一个 owning boundary 内必须只有一个 canonical contract、一个 authoritative data source、一个 owning service 和一条可成功的 handler/adapter/projection 链；普通领域条件分支不属于多路径，但不得让相同输入因版本、旧数据、缓存命中、加载顺序、异常、feature flag、注册优先级或异步时序进入不同实现、事实来源或成功语义。
- 禁止显式平行路径，包括内部版本分发、migrator/legacy/compatibility path、dual-read/dual-write、新旧实现并存、用 feature flag 保留替代实现、多个 handler/adapter 按优先级试探、失败后切换 provider/source/reader/renderer、自动修复/重建/重新导入，以及按 raw/cache/projection 可用性选择不同业务事实。替换设计时必须原子切换本次边界内 producer、consumer、registration、fixture 和测试，并删除被替代入口、导出与实现。
- 禁止隐藏成功路径。缺失依赖、非法 contract、未注册 handler/renderer/adapter、缺失 authoritative source 或不可达状态不得通过宽泛 `try/catch`、空数组/空对象、默认成功、implicit session/project/workspace、no-op、wildcard/default handler、`try-next` 链或回退到 active/current instance 伪装成功。稳定可选字段的永久缺省语义和非 authoritative UI 状态的局部 canonical 默认值不属于 fallback，但必须与旧数据 shape、release generation 和替代业务实现无关。
- Adapter 只允许位于真实运行或信任边界，负责格式转换、认证、授权和调用，不得拥有业务事实、业务路由、迁移/兼容策略或 projection authority，不得 adapter 套 adapter 以保留旧路径。多个第三方或 OS adapter 只能由 canonical owner 根据用户显式选择或当前真实能力精确选择；第三方版本和协议差异必须封闭在 provider-specific adapter 内，adapter 失败只能拒绝当前请求并返回 diagnostic，不得隐式切换 provider、source、contract 或内部实现。
- Projection 必须是由 authoritative source 计算出的可重建、只读 read model，不得成为第二事实来源、写回业务事实或参与 contract/data generation 路由。Projection 只能使用稳定 domain/instance/request/owner identity；`sourceFingerprint` 只可表达内容新鲜度，不得成为持久 identity、schema version 或兼容分发键。单条 projection 失效必须逐项隔离并保留有效 sibling；从当前 authoritative source 重新投影属于 canonical 计算，不是数据迁移，但读取失败后回退旧 projection、raw path、cache path、legacy source 或空成功结果一律禁止。
- Cache 必须对业务语义透明且可丢弃，cache hit/miss 不得改变 contract、authority、identity 或结果含义；miss 只能进入同一 canonical computation，stale/损坏 cache 不得作为替代成功来源。Registry 必须以精确 identity 映射唯一 handler/adapter/capability，禁止 first-compatible、wildcard/default、失败后尝试下一项或重复注册覆盖；批量注册和加载必须逐项 fail-local。
- 多路径测试必须进行路径级而非仅结果级验收：断言唯一 canonical owner、contract、handler、adapter、authority 和 projection 被命中，断言不存在旧入口、平行 registration、fallback provider/source、raw/cache/legacy bypass、active-instance fallback 和 test-only direct runtime shortcut，并覆盖一个非法输入或 projection 失效时 sibling 记录、实例、能力和工作区仍可用。用户显式选择的领域模式、用户管理的 Character/素材版本、第三方版本、正常 `Suspense fallback` 加载 UI，以及同一外部请求不改变 provider/source/contract/成功语义的有界重试不属于违规路径。
- 路径系统只保存相对路径或 `${VAR}/path` 形式，避免写入绝对路径；优先复用 `PathResolver` 与现有设置机制。
- 遵守共享层级隔离：
  - L0：零依赖基础能力
  - L1：host/runtime 能力
  - L2：DOM / React 能力
  - 不要破坏依赖方向

## UI、业务实例与运行时生命周期

- Desktop 必须分别建模四类状态 owner：本地 durable 业务记录、当前可见 presentation、可脱离 UI 的后台 task/runtime、可丢弃并可重建的 package-owned presentation snapshot。禁止用统一 `Session`、`OpenInstance`、Workbench catalog、全局 store 或 active identity 同时承载这些生命周期；名称相似、需要恢复或曾被打开不构成共享 owner 的依据。
- 新增入口、页面、标签页、聊天室、助手或编辑器前，必须先归类为 Window 导航、领域 durable 记录、后台 task/runtime 或 package-owned presentation snapshot，并明确 owner、identity、创建条件、释放条件和恢复来源。仅需要切换展示的能力必须保持为当前 scene；无法证明独立业务生命周期时，不得新增 Session/OpenInstance、跨领域 registry、常驻 Root 或“已打开”数量模型。
- 不得把 Agent Conversation/Task 或 Workspace Canvas/Editor 规定为整个产品的统一核心实例。入口与管理场景是 Window 导航，Workspace/Project 是本地创作上下文，Conversation/Task 是可后台运行的业务实例，Canvas/Cut/Preview 是文档或 View 的领域实例；它们只能通过明确、最小、可校验的 identity 引用协作，各自 ownership 和生命周期不得被提升为万能 Session、Workbench 或页面模型。
- Project、Workspace、Conversation、Room、Asset、文档等本地用户记录与其 UI/runtime 驻留必须解耦；不得通过限制、删除、隐藏或自动归档历史记录来控制内存、React Root、subscription、provider 或进程资源。大量记录应使用轻量 metadata、分页、搜索、最近项和用户显式归档/删除管理。
- Desktop Window 只保留稳定的窗口级 Shell，并只挂载当前 scene composition 在各可见 slot 明确引用的业务 Root；同一 slot 不得同时保留多个历史 Root，只有产品明确提供且用户当前可见的分屏操作才可增加 `Secondary Main`。离开场景后，隐藏的 Workbench、Agent、管理页、资源页、编辑器和 inspector Root 必须卸载，不得把访问历史实现成永久 mounted tree、portal deck 或隐藏 DOM。当前 Workspace 同时需要的 Agent Interaction、Main editor、Resources 或 Timeline 属于同一可见 composition，不得为了追求“全窗口单 Root”把不同领域职责压入一个组件或 store。
- 入口页、Assets、Extensions、Projects、Settings 等导航目的默认是当前单例场景；“打开”只表示当前 Window 的展示选择，不得仅为导航、返回或保存组件状态创建 durable open-instance、management session 或 retained Workbench catalog。确有独立业务生命周期的 session 必须由对应 owning package 定义，并与窗口导航实例分离。
- Window 导航、入口、创作、资产、扩展和项目列表之间的切换只更新当前 scene 与可见 identity；不得因此重新解析未变化的 Workspace authority、重新绑定仍有效的 Agent/task runtime、重新创建 Window 级 provider、刷新完整 Shell snapshot 或启动与目标场景无关的订阅和 IO。需要恢复的目标 Root 从 owning authority、轻量 metadata 和最小 presentation snapshot 按需重建；不得用预挂载所有场景或保留隐藏业务 Root 换取切换速度。
- 产品不得提供或维护跨领域的“已打开实例”总表。单例导航场景没有打开数量；Workspace/Project、Conversation、Asset 和文档的历史数量不受 UI 驻留预算限制；只有当前可见 slot、显式分屏 slot、正在执行的 task 以及实际持有昂贵资源的 runtime 可以有容量或并发上限。包内 tab、recent 或 history 只是轻量 presentation/catalog projection，不得因此保留对应 React Root 或 runtime。
- Agent 的 Conversation、turn、queue、approval、后台任务、取消和 transcript projection 属于 Agent application/session/task runtime，不属于 React Root、页面 store 或 active Workspace。Renderer 只选择和渲染投影；卸载 Agent UI、切换 Workspace 或进入管理场景不得取消、重定向或转移精确 identity 下仍在运行、排队或等待用户处理的任务。
- Workspace、Canvas、Cut、Preview 和其他编辑器的 durable facts 由领域 owner 保存；仅布局、viewport、selection、scroll、playhead、未发送 draft 等用户有价值的展示状态可以进入最小 package-owned snapshot。切换 Workspace 或场景后应从同一 authority 与 snapshot 重建，禁止用隐藏 Root、跨领域可变 store、进程/媒体句柄、raw path 或重复领域数据保存展示状态。
- 切换 Workspace 的语义是提交当前可恢复 presentation snapshot、卸载当前业务 Root、选择目标精确 identity 并重建目标 presentation；不得删除或重置源 Workspace 的 durable facts，不得停止其受保护后台 task，也不得让目标 Workspace 继承源 Workspace 的 transient state。未声明为可恢复 snapshot 的临时查询、hover、打开菜单和未提交手势可以按 owning package 的显式策略重置，这不构成工作区状态丢失。
- 资源限制必须作用于真实消耗：可见 Root、昂贵 runtime、provider turn、媒体/GPU 资源、subscription 和后台 Job 并发；不得把“打开过多少记录”或 durable catalog 总数当作资源预算。具体并发数和保留条件必须由 owning application service 明确定义，并通过测量、取消、排队、公平性、释放和重开测试验证，active/current identity 不得参与任务所有权或调度优先级。
- 不可见且无运行、排队、审批或未完成外部操作等真实执行保护条件的 runtime 应显式释放；受保护后台 runtime 可以在无 UI 时继续，但不得因此保留 React tree。未发送 draft、选择、滚动和编辑器展示状态必须在卸载前进入最小 snapshot，不得作为保留 React Root 或无执行任务 runtime 的理由。释放不得修改 durable catalog、transcript、项目事实或产物；重开必须绑定原精确 identity，禁止回退到 active/recent Workspace 或 Conversation。
- durable 记录失效时必须由 owning catalog 保持可见并携带明确 diagnostic，打开、执行和其他依赖有效 authority 的操作必须禁用；用户显式删除、移除或重新关联以外，不得因 UI 卸载、runtime 释放、数量预算或 presentation snapshot 失效而自动隐藏、转换、修复或清理记录。单条记录或单个 Surface 重建失败必须局部隔离，不得卸载窗口 Shell、清空 sibling catalog 或停止无关后台任务。
- 未经真实内存、切换延迟和重开成本证据，不得引入通用 LRU、跨领域 cache manager、页面 registry 或多层 residency policy。确需缓存时，必须先通过 OpenSpec 定义单一 owner、容量、pin/protect/evict 条件、可丢弃语义和验证预算；cache 不得成为记录可见性、业务事实或后台任务生命周期的 owner。
- 本地 UI/runtime 生命周期和资源预算不得以云同步、远程 session server、多租户或跨设备一致性为前提；此类能力只有在出现真实产品需求并通过独立 OpenSpec 定义 authority、冲突和用户数据保护后才能引入。

## Agent Prompt / Capability / Skill 注入边界

- 系统提示词负责默认 Agent 人设、通用行为准则、通用工具协议、Markdown/引用/视觉证据/安全边界、工具发现与失败处理规则。
- 子包 capability 注入负责领域工具、operation 名称、参数 schema、validation、diagnostics、资源绑定、authoring lifecycle 和领域能力目录。
- Skill content 负责扩展能力、领域方法论、创作语义、任务判断、输出风格和提示词写作规则；不得承担运行时工具协议或子包内部 schema。
- Skill 正文不得写具体工具名教程、命令名、参数表、轮询/任务协议、UI 命令流程、缓存/Webview/path 协议或子包 authoring 细节。需要这些信息时，放到系统提示词、子包 capability prompt、tool schema 或运行时 catalog。
- 工具名允许出现在机器可读元数据中，例如 `allowedTools`、`optionalTools`、`toolDefinitions`、tool registry、tool schema 和测试 fixture；不得以自然语言教程形式进入 Skill prompt content。
- 新增/修改 Skill 时必须补充或维护防回流测试，确保 builtin/custom skill content 不重新包含被系统提示词或子包 capability 拥有的工具协议。

## Agent Evaluation 开发边界

- Agent Evaluation 是仓库外部测试平台能力，由 `scripts/agent-eval` 拥有 suite、Scenario、fixture、assertion、Judge、comparison、报告和调度；不得注册为产品 Skill、capability、普通用户入口、第二个 Agent controller 或 direct runtime runner。
- Evaluation Skill 只负责覆盖判断、声明式 authoring 草案和证据解释；可执行测试意图必须进入严格 suite/Scenario/assertion/ablation artifact。Skill 不得生成或执行每 case JavaScript、注册 handler、决定 outcome、持有凭据/进程协议，中央 runner 也不得按 `scenario.id`、Skill 名或业务功能名增加成功分支。
- 确定性 case 解析由现有 Evaluation runner 复用 strict schema、引用、profile、supported-kind 和 workflow 状态机完成。没有跨进程持久计划、多个真实执行后端或不可变计划缓存等实际消费者时，不得新建 compiler service、workspace package、动态插件系统或通用 UI/Agent DSL；达到提取条件后必须通过 OpenSpec 重新定义 owner、contract、lifecycle、errors 和验证证据。
- `pnpm test:agent:eval`、key-free harness、provider-backed case、hidden/visible Desktop、重复 matrix、configuration/implementation ablation 和图形化 Electron 验收都必须由开发者通过显式本地入口运行，不得直接或间接加入 GitHub Actions、`check:ci`、`gate:local`、`gate:remote`、`ci:local`、`ci:remote` 或其他通用 CI script composition。CI 只能运行普通 unit/contract/headless 测试和“本地入口不可达”的编排回归。
- 真实 API Evaluation 唯一允许的用户配置来源是 `~/.neko/config.toml`；本地 CLI 和环境变量不得改写该路径，也不得回退到 JSON/YAML、其他用户配置或 mock。Evaluation 只在启动前验证可读的原生 TOML，不得要求精确的 POSIX 权限模式、修改用户配置权限、编译另一格式、合并默认值、推断 provider、写回用户目录或把配置内容写入报告。配置原样复制到隔离 fixture 时可为新建的 fixture 文件选用安全默认权限，但该默认值不是源配置的运行资格条件。
- `~/.neko/config.toml` 内凭据由产品配置 owner 解析；Evaluation 不得读取、打印或投影 secret。provider/model identity 与成本授权必须显式提供，缺失时在启动 Desktop 和调用 API 前返回 `infrastructure-blocked`。
- key-free、dry-run、mock、最终文本、单次 Judge 或 hidden window 结果只表示 harness/authoring readiness，不是 Agent 行为、模型质量、真实 API、UI 或消融验收证据。
- Agent 用户功能的开发验收必须使用可见真实 Electron UI，通过用户可操作的 composer、会话导航、审批和领域控件发起，并使用真实 API 验证最终回复、运行终态、会话/Scene identity 和错误展示；automation bridge、直接 IPC/turn 调用或预置数据库不得替代该 UI 路径。
- Agent 批量行为回归必须使用无可见 UI 的完整 Desktop session owner + 真实 API，通过公开 Agent input path 驱动；不得为批量速度改用 direct runtime runner、mock provider、最终文本 fixture 或第二套 session assembly。批量 lane 与可见 UI lane 是互补证据，任一方不得替代另一方。
- Agent 基线覆盖至少包括：基础真实对话与终态收敛、上下文压缩后的继续对话、完整 owner/应用重开后的 transcript 恢复、生成 Job/Tool/产物记录恢复、多个会话的正确切换展示，以及 transcript/queue/config/context/artifact 的会话隔离。变更可按影响范围运行子集，但 AgentSession、持久化、projection 或发布验收必须记录整套矩阵的覆盖、未执行项与风险。

## 设计与实现规范

### Application root 与业务 ownership

- `apps/neko-desktop` 必须保持薄应用组合根，只允许拥有 Electron app/window/view/webContents
  生命周期、安全/CSP/protocol/fuse、Main/preload/renderer 入口、sender-bound typed IPC、原生资源
  授权 adapter、产品 shell/presentation composition、package public port wiring、打包和真实 Electron
  fixture。
- 领域实体、业务状态机、业务并发控制/CAS、业务错误 taxonomy、配置解析、业务校验、数据变换、
  同步/恢复/authoring/portability workflow、Prompt/Skill/Tool/Agent workflow 策略必须进入对应一级
  `packages/*` owning package。当前只有一个 Desktop consumer 不构成留在 `apps/*` 的理由，也不要求
  为此建立 TUI、VS Code 或通用 multi-host framework。
- 判断 Desktop 代码归属时必须完成五层审计：
  1. 职责：决定 Electron/产品 shell 行为，还是决定领域结果；
  2. 依赖：真正依赖 Electron object/sender/window identity，还是只需要可注入 port；
  3. 接口：是否应由 package public contract/application port 表达；
  4. 扩展：变化来自 OS/Electron，还是领域规则、provider、format 或 workflow；
  5. 测试：authoritative test 是否必须启动 Electron。
- 只依赖注入的 file/time/credential/process 等 port、可脱离 Electron 执行并决定业务结果的 service，
  即使只有一个调用方，也必须下沉 owning package；Desktop 只保留边界 decode、sender/路径授权、
  concrete port implementation、调用和结果投影。
- 现有 `apps/neko-desktop` 中的业务实现属于待迁移架构漂移，不构成先例。新增或实质修改命中混合职责
  文件时执行“触碰即收敛”：优先在同一 OpenSpec 下沉；无法同时迁移时，必须记录 owner、目标
  package/public entry、阻塞、旧路径删除条件和验证任务，且不得扩大 app-owned 业务 API。
- 跨领域业务没有明确 owner 时，先通过 OpenSpec 定义中立职责和依赖方向；禁止创建
  `@neko/desktop-core`、Desktop manager bag、万能 facade 或平行业务 contract 收纳无归属逻辑。
- 从 Application 层迁移业务逻辑时，必须先建立 package-owned contract/test/application service，
  再一次性切换本次边界内调用方，并删除旧 app path 及其入口、导出、注册、fixture 和专用测试；禁止用
  poison、fail-closed 占位、compatibility shim、双实现、双写或 fallback 保留旧路径。
- 新增 `apps/neko-desktop` 生产模块或保留 app-local 实现时，OpenSpec、PR 或交付说明必须说明允许职责、
  组合的 package public contract、为何必须依赖 Application 层，以及 package producer、Desktop
  consumer、canonical path 和真实 Electron（如适用）验证证据。

- 遵循“契约优先、自顶向下”顺序：
  1. 先定义类型和接口
  2. 再搭建抽象层或骨架
  3. 最后补齐具体实现
- 文件内代码顺序应从抽象到具体：类型/接口 → 抽象实现 → 具体实现 → 工具函数 → 导出。
- 存在真实替换点、跨层边界、多实现或运行时扩展需求时，优先考虑依赖注入、抽象接口、注册表、策略或事件驱动；单一稳定调用链优先直接模块组合，不得为了形式同时叠加 interface、factory、registry、provider 和 adapter。
- 接口应小而专注，命名清晰，避免把多个职责揉进同一模块。
- 新增抽象前必须明确 owning responsibility、调用方、实现方、生命周期、错误契约和替换条件；若无法说明真实变化点，优先保持直接而清晰的实现。已有抽象无法表达正确设计时，应更新或替换契约及调用链，不要在旁边增加第二套接口、平行 adapter 或条件分支维持多种事实来源。
- runtime、session、task、编辑器或其他可并发逻辑实例默认必须独立拥有其可变状态、配置投影、消息队列、异步任务、日志和资源句柄；界面选择或 active 标记只用于选择展示投影，不得作为实例状态 owner，也不得通过共享单例切换参数模拟多个实例。
- 所有 instance-scoped operation 和 event 必须携带显式 instance identity；缺失、陈旧或不匹配时应 fail-visible，不得回退到当前 active instance。
- 多实例确需共享的目录、用户设置或静态配置应以只读服务或不可变快照提供，不得成为跨实例共享可变状态。
- 并发设计优先级是：实例/所有权隔离 → 消息传递 → 不可变快照 → 最小范围同步 → 互斥锁。不得用锁维持本可拆分的共享单例、全局 active state 或多实例参数切换。
- 锁只用于无法隔离的真实共享资源，例如持久存储原子写入、设备句柄或外部进程协调；使用时必须明确 owner、作用域、生命周期、锁顺序、取消/超时和并发测试。
- 功能设计、架构设计、模块设计和问题修复必须收敛到唯一 canonical path；内部设计问题应修改设计和契约，不得通过兼容层、fallback、双实现、多路条件分发或锁叠加维持错误结构。
- 实现新功能前，优先复用现有资源：
  - `packages/shared/src/`
  - package-owned L0 contracts
  - `packages/ui/src/`
  - `packages/cut/webview/src/components/`
  - `packages/cut/webview/src/hooks/`
- `@neko/platform` 已删除；配置、provider、Generation、Content 与 Host 能力必须直接使用其 owning package 的公开入口，不得重新建立聚合 facade。
- 新功能涉及组件样式、主题、国际化、日志、错误/诊断、配置、路径、文件保存/读写、资源授权、缓存、DTO 或跨包契约时，必须先做公共基础能力审计：判断应复用现有公共入口、更新公共契约/adapter，还是确实保留在 owning package。
- 禁止在功能包内并行实现 package-local design system、theme token、i18n runtime、logger/error 类型、项目文件 IO、cache manager、path resolver、宽泛媒体 client 或无 owner 的共享 DTO；确需新增公共能力时优先进入 `@neko/shared`、`@neko/ui`、owning package L0 contract 或既有 domain service。
- 若决定不更新公共层，必须在 OpenSpec、PR 或交付说明中说明原因、边界、后续提取条件和验证命令。
- 新功能涉及 provider、registry、bridge、protocol、message router、status bar、tree view、file decoration、history、selection、recent items、projector、facade、command router、capability provider、store slice 或 workflow adapter 时，必须先做跨子包能力复用审计：搜索其他子包是否已有同类能力、相同交互模式或相同 host adapter。
- 两个以上子包出现领域语义、生命周期、运行环境、错误模型和变化方向一致的同类能力时，优先提取到中立共享层、domain service、shared contract、adapter factory、registry、strategy、hook 或 `@neko/ui` primitive；仅名称或代码结构相似不足以证明属于同一抽象，不得为了消除少量重复强行共享，也不要让功能包直接 import 另一个功能包的内部实现。
- 保留 package-local 实现时，必须说明职责、生命周期、领域语义、依赖方向或运行环境为何不同，以及后续满足什么条件会抽到共享层。
- 新增 Webview/React 组件前必须先做组件复用审计：搜索 `@neko/ui`、同包 `components/`、`hooks/`、`shared/`、相邻领域包和已有测试，优先增强旧组件、提取 prop/slot/variant、或抽出 package-local adapter。
- 只有在职责、状态生命周期、交互契约或可访问性语义明显不同，且增强旧组件会增加耦合或破坏既有使用方时，才新增组件；新增时需在 OpenSpec、PR 或交付说明中写明复用审计结论。
- 不要为单个页面复制按钮、选择器、面板、空状态、工具栏、列表、卡片、输入区、Header/Input 等已有模式；跨两个以上 Webview 复用的无业务 UI 优先进入 `@neko/ui`，领域专属适配留在 owning package。

## Bug 定位与修复

- 遇到 bug、失败、性能回退或异步竞态时，先稳定复现并沿完整调用链定位第一个违背契约或产生错误状态的位置；结合日志、diagnostic、trace、最小复现、失败测试和路径断言验证根因，不要只在最终报错点修补表象。
- 修复前应检查问题是否来自职责归属错误、接口不完整、状态模型不一致、生命周期失控、并发/取消缺失、跨层契约漂移或旧路径残留；若根因属于设计问题，必须更新设计、契约和 canonical path，再删除被替代实现。
- 禁止在同一问题上持续叠加局部 patch、宽泛 try/catch、默认值、重试、兼容分支、fallback、重复校验或 no-op guard。每个保护分支都必须对应真实外部边界或明确可恢复条件，并定义失败来源、恢复语义、可观测 diagnostic 和可测试路径；恢复结果不得伪装成原操作成功或改变内部契约。
- 修复必须证明根因已被消除：补充能够在修复前失败的回归测试，并验证上游输入、关键中间状态、目标 handler/adapter/renderer 和最终用户路径；不能仅通过让报错消失、返回空数据或改写测试期望完成修复。
- 若连续修补暴露出同一抽象或状态模型反复失效，应停止继续打补丁，重新评估职责、契约和数据流，并以一次边界清晰的重构替换问题路径。

## 禁止与推荐

- 禁止：
  - 在生产代码中滥用 `any`
  - 使用 `console.log` 作为正式调试/日志方案
  - 硬编码配置
  - 忽略异步错误
  - 用 `as Type` 做不安全的强制断言
- 推荐：
  - 用 `unknown` + 类型守卫替代 `any`
  - 使用项目 Logger 替代 `console.log`
  - 用配置、常量或 schema 管理可变参数
  - 为异步流程补齐错误处理、取消和边界检查

## Desktop 专项约束

- Renderer/Webview 侧不得导入 `electron`、`node:*` 或访问 Node globals。
- Desktop Main 侧不得引入 React。
- preload 只投影最小、类型化、sender-bound 的 IPC contract；不得暴露通用 `ipcRenderer`、文件系统或 shell 能力。
- 涉及 Desktop 视觉、交互、CSP、消息、焦点或媒体的验收必须运行真实 Electron 应用；普通浏览器/Vite 只可作为纯浏览器兼容性辅助。
- 注意 renderer reload 状态、异步竞态、内存泄漏、IPC 丢失与窗口关闭后的资源释放。
- 所有 Electron listener、窗口、FFmpeg/HTTP session 和文件 watcher 都要显式释放。

## TODO 与增量实现

- 契约先行但实现暂未完成时，可保留带优先级的 TODO：
  - `TODO(P0)`：必须立即完成
  - `TODO(P1)`：当前迭代核心功能
  - `TODO(P2)`：可延期增强项
- TODO 应与完整接口或骨架实现一起出现，不要边写边发明接口。

## Prelaunch 数据与替换策略

- 项目尚未发布时，可以对未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 和 nk\* 草稿格式做显式破坏性调整，用于清理 legacy debt 或收敛到更清晰的架构。
- “未发布”不等于可以牺牲既有用户数据。破坏性变更必须说明影响范围和旧数据处理方式；所有持久化数据必须遵守禁止生产迁移代码和局部失效规则，内部组件格式还必须禁止无意义版本化。失效数据只能通过用户明确执行的手动操作或独立离线脚本修复，不得由产品自动迁移、重建或重新导入。
- 禁止内部组件和存储格式版本化。组件内部持久化 namespace、目录、key、identity、索引和查询条件不得依赖应用、包、组件、Skill、Prompt、provider、model、build、release、schema version、format revision 或 migration marker，也不得按这些内部版本切换读写路径或判定数据有效性。用户显式管理的 Character、素材等领域版本必须保留为 owning domain 的业务数据；第三方服务、库、API、协议、模型和文件格式版本必须保留在对应外部集成边界，两者均不属于内部组件格式版本。
- 禁止在应用、workspace package、runtime、启动流程、读写路径或产品构建产物中编写、注册或调用任何持久化数据迁移或兼容代码，包括 migrator、upgrade handler、旧格式转换、版本探测、legacy reader/writer、旧字段 alias/mapping、为旧数据补默认值、dual-read、dual-write、自动重建、兼容 codec/handler、迁移期 compatibility path 和按旧数据 shape 分支。组件数据契约必须长期稳定；演进只能增加具有明确缺省语义的可选字段，并保持所有既有数据原样可读，不得删除、重命名或改变已有字段语义。
- 项目事实、用户内容或组件 authoritative data 失效后，只允许用户明确执行手动修复或独立离线数据修复脚本；非 authoritative 参数和可恢复状态按下一条规则局部重置，不属于数据迁移。脚本必须位于产品运行路径之外，不得被应用、package public entry、构建、安装、启动、读取、写入、通用测试或 CI 自动导入或调用，不得包含版本探测或形成长期兼容路径；脚本必须要求显式目标和确认，修改前备份原数据，只处理指定的失效记录或组件实例，并在写回前后验证结果。离线修复脚本属于显式运维工具，不得演变为产品迁移机制。
- 组件数据失效必须隔离在最小可判定范围，优先为单条记录，其次为单个组件实例。可恢复的旧参数和非 authoritative 状态应只回到该范围的 canonical 默认状态；项目事实、用户内容或组件 authoritative data 应只显示对应项目、记录或组件失效。不得因一个组件、实例或记录的数据损坏、缺失或不可读而使其他组件、项目、工作区或整个应用不可用。系统必须保留其余数据的读取和操作能力，并对失效范围返回明确 diagnostic；不得通过全局加载失败、清空全局状态或统一判定全部数据失效来简化错误处理。
- 数据测试必须覆盖：升级后既有数据仍原样可读；产品代码和运行路径中不存在数据迁移、兼容或自动修复路径，内部组件格式不存在版本判断；用户管理的领域版本以及第三方版本字段仍被原样保留；旧参数或可恢复状态失效时只有对应 scope 回到 canonical 默认状态；项目事实或组件 authoritative data 失效时只有对应项目、记录或组件显示失效，其他组件、项目、工作区和应用仍可正常使用。离线修复脚本必须使用隔离 fixture 验证目标限定、备份、写回校验和失败不覆盖原数据。
- 预发布重构的默认顺序是：先限定本次替换的最小目标边界并定义目标设计/契约，再直接删除该边界内旧 compatibility shim、legacy adapter、fallback branch、dual-read/dual-write、旧字段映射、旧命令入口及其注册和引用，确认旧路径不存在且不可触发后，再开发新 canonical path 并接入验证。不得用 poison、fail-closed 占位、并行接口、双实现或多路条件分发保留旧数据路径。
- 当现有设计无法满足正确性、扩展性或测试性要求时，应修改目标设计和契约，并一次性迁移本次边界内的调用方；不要保留错误设计，再通过 fallback、adapter 套 adapter、版本分支或双写路径绕开设计问题。
- 生产代码中的数据迁移和数据兼容逻辑没有临时例外；保护有价值本地数据、已发布契约或外部信任边界也不得成为保留旧数据读取、转换、fallback 或双路径的理由。数据保护只能通过备份、局部 fail-visible，以及用户显式执行的手工或独立离线脚本实现。
- 开发和测试新路径时必须删除旧数据路径及其注册、入口和引用；不得保留即使默认关闭或只返回 diagnostic 的 compatibility shim、legacy adapter、migration-only handler、feature flag 或隐藏命令。旧数据只能由当前 canonical contract 局部拒绝，不得进入产品内迁移或兼容流程。
- 不得用过度兜底或兼容逻辑隐藏代码缺陷：缺失新实现、contract mismatch、非法状态、未知消息、错误配置、未注册 handler/renderer/adapter 时，应 fail-visible 并暴露问题；不能回退旧实现、默认空数据、默认成功状态或 no-op。
- 新路径验收必须是路径级验收，不得只断言最终结果成功；长期测试必须正向断言唯一 canonical contract、handler、renderer、adapter、authoritative source 和 projection 被注册或调用，并通过精确 registry/import/export 约束阻止第二条成功路径，不得为了证明替换完成而永久保留被替代路径的名称、类型、入口、fixture、spy target 或专用 diagnostic。
- 替换开发期间可以使用未提交或明确临时的旧输入 fixture、路径 spy、计数器和一次性搜索，验证旧路径已失效、新路径已生效；交付前必须删除这些临时测试资产及其引用，不得进入长期单元/集成测试、普通 fixture、snapshot、Evaluation suite、产品包、构建产物或质量 ledger。OpenSpec、PR 或交付说明只记录验证结论和命令，不得把历史 shape 或旧实现重新保存为可执行测试知识。
- 长期测试只验证当前 canonical contract 的有效行为、与历史 shape 无关的一般非法输入、最小 owning scope 的明确 diagnostic，以及无关 sibling 仍可用；不得保留 legacy fixture、旧字段 fallback、旧 message/renderer/command、兼容 alias、fallback provider/source 或专门识别已删除 shape 的拒绝测试。当前 canonical decoder 应按当前必填语义拒绝非法输入，不得知道其属于哪个历史版本或旧路径。
- 集中式仓库门禁可以保留验证拦截器本身所必需的最小合成反例，但必须位于治理脚本的聚焦自测中，与产品 import、构建、普通领域 fixture 和运行时不可达，且不得复制真实历史 payload、维护已删除入口清单或为具体旧路径建立长期行为测试。门禁必须默认扫描生产代码和测试代码；允许项必须精确到 occurrence 和真实外部/用户领域语义，不得按目录、文件名、`provider`/`runtime`/`canonical` 等宽泛词汇放行。
- 不能借 prelaunch cleanup 忽略 Electron、Node、pnpm、OS、renderer sandbox、CSP、codec、Range、FFmpeg、Proto、marketplace trust 或安全边界。
- 不能静默删除或损坏有价值的本地项目数据、用户设置、trust state、entitlement、插件安装记录或生成产物。任何持久化数据都不得由产品迁移或重建，必须按上述规则保持稳定读取或局部 fail-visible；确需修复时只能使用显式手动操作或产品运行路径之外的独立离线脚本，并提供明确的数据保护方案或 fail-closed diagnostic。

## 测试与质量门禁

- 单元测试只是实现级反馈，不代表功能验收完成。新增功能、bug 修复和非平凡重构必须按影响范围完成从局部到系统的验证；若同时命中多种变更类型，验证要求取并集。

| 变更类型                                                                                                                    | 最低必要验证                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯文档、注释或无运行时影响的元数据                                                                                          | `git diff --check`，并检查相关链接、路径、schema 或文档一致性                                                                                                                                                  |
| 局部 TypeScript 逻辑或 bug 修复                                                                                             | 修复前可失败的聚焦回归/单元测试、受影响包 typecheck/build；涉及调用链时补集成或路径断言                                                                                                                        |
| 共享 TypeScript 契约、跨包重构或高风险路径                                                                                  | 生产者和消费者测试、`pnpm build`、`pnpm test`、`pnpm check`；必要时运行 `pnpm ci:local` 或与远端 CI 对应的聚焦门禁                                                                                             |
| 残留、兼容层、冗余或依赖清理                                                                                                | `pnpm check:legacy-debt`、`pnpm check:unused`，或说明已由 `pnpm ci:local` / `pnpm check:quality` 覆盖                                                                                                          |
| package-owned wire contract、Desktop IPC 或跨层 message                                                                     | 生产者/消费者测试、契约路径断言，以及受影响 Electron 运行态或集成验证                                                                                                                                          |
| Node/FFmpeg 媒体 runtime                                                                                                    | 聚焦 Node/FFmpeg、Range/PCM、取消与资源释放测试；涉及 Renderer 时增加真实 Electron 媒体路径验收                                                                                                                |
| Agent evaluation harness、scenario manifest、debug automation 或 facts 契约                                                 | 显式本地运行 `pnpm test:agent:eval`；该命令不得进入 CI，且仅是 key-free harness 自测，不得描述为真实 Agent 行为验收                                                                                            |
| prompt、Skill、capability/tool routing、provider/model、AgentSession、validation/recovery 或 Desktop Agent event projection | 按 `.codex/skills/neko-agent-evaluation/SKILL.md` 运行真实 API：功能路径用可见 Electron UI，批量回归用隐藏完整 Desktop session；覆盖适用的对话/压缩/重开/生成记录/切换/隔离矩阵，无法运行时记录 blocker 与风险 |
| Renderer/Webview 视觉、交互、CSP、消息、焦点或媒体                                                                          | 受影响构建/测试，加真实 Electron Desktop 聚焦场景；普通浏览器/Vite/Chrome 不能替代 preload/IPC/窗口生命周期验收；UI 运行态测试不得进入 CI                                                                      |
| 发布链路或影响面不易限定的高风险改动                                                                                        | `pnpm ci:local`，并按领域分别显式本地运行适用的 evaluation、Electron Desktop UI 或 Node/FFmpeg 运行态验证；不得把本地专用入口并入 CI 命令                                                                      |

- 新路径、独立离线数据处理脚本和 bug 修复必须同时验证结果与执行路径：长期生产测试正向断言唯一 canonical contract、handler、renderer、adapter 或 Node/FFmpeg path 被命中；替换期间对旧路径的反向验证属于交付前必须删除的一次性证据。离线脚本必须额外证明不会被产品代码、构建、启动、通用测试或 CI 调用。
- 验证应重点发现循环依赖、Layer 0 反向依赖、Renderer/Webview 依赖 Electron/Node、Desktop Main 依赖 React、包到应用反向依赖等架构违规。
- 验收结论必须列出实际执行的命令、结果和覆盖层级；未执行项需记录不适用原因、阻塞条件和残余风险，不能仅以单元测试通过声明功能完成。
- Webview 功能场景由 owning package 维护 fixture、用户操作、业务断言和 authoritative side effect；共享 runner 只拥有宿主/CDP/错误策略/报告机制，不得在共享层加入包级业务 shortcut。
- Webview 功能测试必须使用隔离、合成 fixture workspace；不得采集普通开发窗口、真实用户工作区、凭据或本机私有配置作为截图、DOM、日志或报告证据。
- 原始功能报告写入 gitignored `reports/webview-functional/`，CI artifact 默认保留 14 天。可提交的 OpenSpec/PR 摘要只记录 scenario id、命令、宿主/版本、结果、失败分类、脱敏证据位置和剩余风险；分享或提交前必须检查并移除 secret、token、绝对用户路径和非 fixture 内容。

## 完成定义

新增功能、bug 修复和非平凡重构只有同时满足以下条件，才可声明完成：

1. owning responsibility、目标设计、契约和依赖方向已经明确，并符合现有架构。
2. canonical path 已实现并接入；本次边界内被替代的旧实现、入口、导出、注册、fixture、专用 diagnostic 和临时验证测试均已删除，不存在被禁用、poison、fail-closed 隔离或仍可触发的旧路径。
3. 抽象保持精简，未引入无真实变化点的接口层，也未保留平行接口、多实现或多种事实来源绕开设计问题。
4. 回归测试能够证明目标行为或 bug 根因，并覆盖关键中间状态和执行路径。
5. 已完成“测试与质量门禁”中所有适用验证，不能只依据单元测试或局部构建判断通过。
6. 影响使用方式、架构、契约或模块入口时，相关 README、架构文档、OpenSpec 或包级文档已同步。
7. 未执行验证、外部阻塞和残余风险已在交付说明中明确记录。

## 交付前检查

- 架构上符合 SOLID，职责清晰，无循环依赖，依赖方向正确。
- 代码遵循契约优先与自顶向下实现，没有用 fallback、兼容分支或平行路径掩盖设计问题。
- 没有遗留明显的 `any`、`console.log`、不安全断言和硬编码。
- 异步取消、资源释放、外部 provider 和用户数据边界具备明确错误语义与诊断。
- 复杂流程或状态机已通过 Mermaid、测试或清晰文本说明关键状态和路径。
- 交付说明列出设计/复用审计结论、验证命令与结果、未执行项和剩余风险。

## 常用验证命令

```bash
# 基础验证
pnpm build
pnpm test
pnpm check

# 完整本地 CI 与质量门禁
pnpm ci:local
pnpm check:quality
pnpm check:legacy-debt
pnpm check:unused

# Agent Evaluation（仅显式本地运行，不得加入 CI 组合）
pnpm test:agent:eval

# Desktop package
pnpm package:desktop

```
