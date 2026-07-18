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
- 非平凡功能、跨模块修改、公共契约或架构变更，实施前必须按 `openspec/project.md` 创建或更新 OpenSpec artifacts；proposal、design、spec 和 tasks 是实施约束，不是事后补写的文档。
- 遇到多模块改动或新功能，先做五层分析：职责、依赖、接口、扩展、测试。
- 分析必须覆盖完整调用链和真实运行边界，不能只优化当前文件、当前函数或单个测试暴露出的局部现象；先确认输入、状态、契约、依赖、资源生命周期、错误传播和最终用户路径，再决定修改位置。
- 抽象只服务于稳定职责、真实边界或明确变化点：接口应精简、可组合、可替换、可测试，不要为单一实现制造无意义层级，也不要为了少写代码把不同职责压进同一接口。
- 简单改动可直接实现，但仍需保持与现有架构一致。
- 本项目是本地 VSCode 客户端 + 本地 Rust Engine，不是云端多租户或分布式后端；设计必须按本地产品边界控制复杂度，避免为了假想远程规模、租户隔离、服务治理或未知未来需求引入过度抽象、过度配置、过度防御或多层 indirection。
- 防御性代码只保护真实边界：VSCode/Webview 沙箱、CSP、Extension/Engine 通信、本地文件与路径、媒体 codec/Range、异步取消与资源释放、外部 AI/market provider、用户数据和安全/信任边界；不要用宽泛 try/catch、静默默认值、fallback、重复校验或 no-op guard 掩盖本应暴露的开发错误。
- 默认采用 fail-visible：契约违背、不可达状态、未实现路径、缺失依赖、非法 message、未知 schema/version 或开发期路径错误应直接抛错、返回明确 diagnostic 或让测试失败；除非保护用户数据、外部 provider、发布兼容或安全/信任边界，不要用兜底值、兼容分支或静默降级把代码问题伪装成成功。
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

- 本仓库是 `OpenNeko`，一个集成在 VSCode 内的创意工作套件 monorepo。
- 主要技术栈：
  - 前端：React 18、Zustand、Tailwind CSS、Vite
  - 插件：VSCode Extension API、TypeScript、esbuild
  - 媒体引擎：Rust（wgpu、FFmpeg、axum、tokio）+ N-API（napi-rs）
  - 流媒体：H.264 + PCM + fMP4 over WebSocket
  - AI：Vercel AI SDK + MCP Protocol
  - 类型契约：Protobuf
  - 构建：pnpm 10 + Turborepo 2
  - 测试：Vitest、cargo test
- 共享基础核心包：
  - `packages/neko-engine`：Rust 媒体引擎（GPU/FFmpeg/音频/HTTP）
  - `packages/neko-types`：共享基础设施（Logger、i18n、Theme、Errors）
  - `packages/neko-client`：流媒体客户端与 `EngineClient`
  - `packages/neko-proto`：Protobuf IDL，类型契约单一事实来源
- 保留产品包：`neko-agent`（AI）、`neko-assets`（素材）、`neko-canvas`（画布）、`neko-cut`（视频）、`neko-preview`（授权只读预览）、`neko-tools`（工具与诊断）、`neko-engine`（媒体引擎），以及 `apps/neko-tui` / `apps/neko-vscode` 宿主。完整边界见 `docs/architecture/package-boundaries.md`。

## 开发前先读

- 功能背景先看 `README_CN.md`，必要时对照 `README.md`。
- 总体架构先看 `docs/architecture/README.md` 与 `docs/architecture/package-boundaries.md`。
- 文档导航先看 `docs/README.md`，不要猜测具体文档路径。
- 系统级架构、ADR 和跨领域约束从 `docs/architecture/README.md` 进入。
- 子包边界、UI 层、公共代码、Extension/Webview/Engine 约束先看 `docs/architecture/package-boundaries.md`。
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
- `packages/<pkg>/docs/` 放只服务某个包的实现、配置和维护说明。
- 新增或移动文档前，先判断它是系统约束、领域模型、调研分析、当前状态、开发变更还是包私有实现。
- 不要把领域内部架构放入 `docs/architecture/<domain>/`；应放入 `docs/domains/<domain>/architecture.md`。
- 不要把实现日志、命令输出、阶段完成记录或临时状态写成架构事实。
- 状态文档中的行动项需要设计、实现或验收时，转入 `openspec/changes/`；只是排队事项时，转入 `TODO_CN.md` / `TODO.md`；长期方向转入 `ROADMAP_CN.md` / `ROADMAP.md`。

## 架构硬约束

- TypeScript 不要放松以下编译约束：`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`。
- Webview 沙箱限制必须遵守：
  - Webview 不能直接访问 Node.js API。
  - Webview 不能直接调用 VSCode API。
  - Webview 资源路径必须通过 `webview.asWebviewUri()` 暴露。
  - Webview 与 Extension Host 之间通过 `postMessage` 通信。
- Webview 负责 UI 渲染、用户交互、可恢复展示状态、浏览器图形/GPU 能力和授权媒体流消费；不得拥有工作区文件读写、持久项目事实、权限与信任、后台任务生命周期、运行时实例状态或宿主业务编排。
- Extension Host 或 host-neutral domain service 负责工作区 IO、持久化、权限、生命周期和业务编排；可跨宿主复用的领域逻辑应进入独立 domain core，不要为了移出 Webview 而全部堆入 Extension Host。
- Rust 引擎是计算逻辑和数据模型的权威来源；TypeScript 层负责 UI 与编排，不要重复实现 Rust 已定义的核心计算或数据变换。
- Protobuf 是跨层类型契约的单一事实来源；涉及引擎通信时优先复用 `packages/neko-proto`。
- 路径系统只保存相对路径或 `${VAR}/path` 形式，避免写入绝对路径；优先复用 `PathResolver` 与现有设置机制。
- 遵守共享层级隔离：
  - L0：零依赖基础能力
  - L1：VSCode 相关能力
  - L2：DOM / React 能力
  - 不要破坏依赖方向

## Agent Prompt / Capability / Skill 注入边界

- 系统提示词负责默认 Agent 人设、通用行为准则、通用工具协议、Markdown/引用/视觉证据/安全边界、工具发现与失败处理规则。
- 子包 capability 注入负责领域工具、operation 名称、参数 schema、validation、diagnostics、资源绑定、authoring lifecycle 和领域能力目录。
- Skill content 负责扩展能力、领域方法论、创作语义、任务判断、输出风格和提示词写作规则；不得承担运行时工具协议或子包内部 schema。
- Skill 正文不得写具体工具名教程、命令名、参数表、轮询/任务协议、UI 命令流程、缓存/Webview/path 协议或子包 authoring 细节。需要这些信息时，放到系统提示词、子包 capability prompt、tool schema 或运行时 catalog。
- 工具名允许出现在机器可读元数据中，例如 `allowedTools`、`optionalTools`、`toolDefinitions`、tool registry、tool schema 和测试 fixture；不得以自然语言教程形式进入 Skill prompt content。
- 新增/修改 Skill 时必须补充或维护防回流测试，确保 builtin/custom skill content 不重新包含被系统提示词或子包 capability 拥有的工具协议。

## 设计与实现规范

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
  - `packages/neko-types/src/`
  - `packages/neko-client/src/`
  - `packages/neko-proto/`
  - `packages/neko-ui/src/`
  - `packages/neko-cut/packages/webview/src/components/`
  - `packages/neko-cut/packages/webview/src/hooks/`
  - `packages/neko-agent/packages/platform/src/`
- 新功能涉及组件样式、主题、国际化、日志、错误/诊断、配置、路径、文件保存/读写、资源授权、缓存、DTO 或跨包契约时，必须先做公共基础能力审计：判断应复用现有公共入口、更新公共契约/adapter，还是确实保留在 owning package。
- 禁止在功能包内并行实现 package-local design system、theme token、i18n runtime、logger/error 类型、项目文件 IO、cache manager、path resolver、Engine HTTP/WS client 或共享 DTO；确需新增公共能力时优先进入 `@neko/shared`、`@neko/ui`、`@neko/neko-client`、`@neko/proto` 或既有 domain service。
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

## VSCode 插件专项约束

- Webview 侧不要导入 `vscode`。
- Extension 侧不要引入 React。
- Vite/浏览器/Chrome/Playwright 只可作为 Webview 热重载和纯浏览器兼容性辅助；涉及 VS Code Extension Webview 的视觉、交互、CSP、消息、焦点或媒体验证时，必须使用 Extension Development Host + `vscode-extension-debugger` Skill。除非用户明确要求浏览器兼容性测试，不要调用 Chrome/Browser/Playwright 作为默认验证路径，也不要把普通浏览器打开 `localhost` 当作运行态验收。
- 注意 Webview 状态丢失、异步竞态、内存泄漏和 `postMessage` 丢失等常见问题。
- 所有 `vscode.Disposable` 资源都要显式释放。
- 扩展之间不要建立直接依赖，优先走共享层或契约层。

## TODO 与增量实现

- 契约先行但实现暂未完成时，可保留带优先级的 TODO：
  - `TODO(P0)`：必须立即完成
  - `TODO(P1)`：当前迭代核心功能
  - `TODO(P2)`：可延期增强项
- TODO 应与完整接口或骨架实现一起出现，不要边写边发明接口。

## Prelaunch 兼容策略

- 项目尚未发布时，可以对未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 和 nk\* 草稿格式做显式破坏性调整，用于清理 legacy debt 或收敛到更清晰的架构。
- “未发布”不等于忽略版本兼容性。破坏性变更必须说明影响范围，以及旧数据是迁移、重建、重新导入、忽略还是有意丢弃。
- 预发布重构的默认顺序是：先限定本次替换的最小目标边界并定义目标设计/契约，再清理或 poison 该边界内旧 compatibility shim、legacy adapter、fallback branch、dual-read/dual-write、旧字段映射和旧命令入口，确认旧路径不能继续返回成功后，再开发新 canonical path 并接入验证。不要在旧路径仍可兜底成功时继续修补旧路径问题，也不要用并行接口、双实现或多路条件分发长期维持新旧多种代码路径。
- 当现有设计无法满足正确性、扩展性或测试性要求时，应修改目标设计和契约，并一次性迁移本次边界内的调用方；不要保留错误设计，再通过 fallback、adapter 套 adapter、版本分支或双写路径绕开设计问题。
- 只有为保护有价值本地数据、已发布契约或外部信任边界时，才允许临时保留兼容逻辑；必须有 owner、replacement、验证命令、移除条件和到期任务。
- 开发和测试新路径时默认禁用兼容 fallback；若执行流命中旧路径，必须立即抛错、返回 fail-closed diagnostic 或触发可断言的 telemetry/log failure，不得继续返回旧路径成功结果；仅在明确标记为迁移、拒绝或诊断测试时可观测旧路径。
- 不得用过度兜底或兼容逻辑隐藏代码缺陷：缺失新实现、contract mismatch、非法状态、未知消息、错误配置、未注册 handler/renderer/adapter 时，应 fail-visible 并暴露问题；不能回退旧实现、默认空数据、默认成功状态或 no-op。
- 新路径验收必须是路径级验收，不得只断言最终结果成功；测试必须断言 canonical path、new handler、new renderer、new adapter 或新 contract 被命中，并通过 spy/counter/log assertion 或将 legacy path poison 成抛错来证明旧路径未参与。
- 新路径验证必须证明旧路径不会被默认命中；若旧路径仍可被触发，必须有显式 feature flag、migration-only 入口、fail-closed diagnostic、telemetry/log assertion 或迁移测试覆盖，并断言旧路径不会为新路径请求返回成功结果。
- 测试不得通过 legacy fixture、旧字段 fallback、旧 message handler、旧 renderer 或旧 command alias 让新路径“看似通过”；需要 legacy 覆盖时必须拆成迁移/拒绝/诊断测试。
- 不能借 prelaunch cleanup 忽略 VS Code、Node、pnpm、Rust、OS、Webview sandbox、CSP、codec、Range、Engine、Proto、marketplace trust 或安全边界。
- 不能静默删除或损坏有价值的本地项目数据、用户设置、trust state、entitlement、插件安装记录或生成产物；必须提供迁移、重建、确认或 fail-closed diagnostic。

## 测试与质量门禁

- 单元测试只是实现级反馈，不代表功能验收完成。新增功能、bug 修复和非平凡重构必须按影响范围完成从局部到系统的验证；若同时命中多种变更类型，验证要求取并集。

| 变更类型                                                                                                                | 最低必要验证                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯文档、注释或无运行时影响的元数据                                                                                      | `git diff --check`，并检查相关链接、路径、schema 或文档一致性                                                                                                   |
| 局部 TypeScript 逻辑或 bug 修复                                                                                         | 修复前可失败的聚焦回归/单元测试、受影响包 typecheck/build；涉及调用链时补集成或路径断言                                                                         |
| 共享 TypeScript 契约、跨包重构或高风险路径                                                                              | 生产者和消费者测试、`pnpm build`、`pnpm test`、`pnpm check`；必要时运行 `pnpm ci:local` 或与远端 CI 对应的聚焦门禁                                              |
| 残留、兼容层、冗余或依赖清理                                                                                            | `pnpm check:legacy-debt`、`pnpm check:unused`，或说明已由 `pnpm ci:local` / `pnpm check:quality` 覆盖                                                           |
| Proto、Extension/Engine bridge 或跨层 message                                                                           | 生成物一致性、生产者/消费者测试、契约路径断言，以及受影响运行态或集成验证                                                                                       |
| Rust Engine                                                                                                             | 聚焦 `cargo test`；涉及客户端、媒体协议或跨层行为时增加对应集成/运行态验证                                                                                      |
| Agent evaluation harness、scenario manifest、debug automation 或 facts 契约                                             | `pnpm test:agent:eval`；该命令仅是 key-free harness 自测，不得描述为真实 Agent 行为验收                                                                         |
| prompt、Skill、capability/tool routing、provider/model、AgentSession、validation/recovery 或 TUI Agent event projection | 按 `.codex/skills/neko-agent-evaluation/SKILL.md` 规划并运行聚焦脚本 evaluation；无法运行真实 case 时记录阻塞条件和残余风险                                     |
| Webview 视觉、交互、CSP、消息、焦点或媒体                                                                               | 受影响构建/测试，加 `pnpm test:webview:functional` 的聚焦真实场景；`pnpm smoke:webview:targets`/target discovery 仅为环境预检，普通浏览器/Vite/Chrome/Playwright 不能替代 VS Code Webview 运行态验收 |
| 发布链路或影响面不易限定的高风险改动                                                                                    | `pnpm ci:local` 加所有受影响领域的 evaluation、Extension Development Host/Webview UI 或 Engine 运行态验证                                                       |

- 新路径、迁移和 bug 修复必须同时验证结果与执行路径：断言 canonical contract、handler、renderer、adapter 或 Engine path 被命中，并证明 legacy/fallback 路径未参与。
- 验证应重点发现循环依赖、Layer 0 反向依赖、Webview 依赖 `vscode`、Extension 依赖 React、扩展包交叉依赖等架构违规。
- 验收结论必须列出实际执行的命令、结果和覆盖层级；未执行项需记录不适用原因、阻塞条件和残余风险，不能仅以单元测试通过声明功能完成。
- Webview 功能场景由 owning package 维护 fixture、用户操作、业务断言和 authoritative side effect；共享 runner 只拥有宿主/CDP/错误策略/报告机制，不得在共享层加入包级业务 shortcut。
- Webview 功能测试必须使用隔离、合成 fixture workspace；不得采集普通开发窗口、真实用户工作区、凭据或本机私有配置作为截图、DOM、日志或报告证据。
- 原始功能报告写入 gitignored `reports/webview-functional/`，CI artifact 默认保留 14 天。可提交的 OpenSpec/PR 摘要只记录 scenario id、命令、宿主/版本、结果、失败分类、脱敏证据位置和剩余风险；分享或提交前必须检查并移除 secret、token、绝对用户路径和非 fixture 内容。

## 完成定义

新增功能、bug 修复和非平凡重构只有同时满足以下条件，才可声明完成：

1. owning responsibility、目标设计、契约和依赖方向已经明确，并符合现有架构。
2. canonical path 已实现并接入；本次边界内被替代的旧路径已删除、禁用、poison 或显式隔离，不能继续兜底成功。
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

# Agent 与 Webview 运行态
pnpm test:agent:eval
pnpm test:webview:functional:p0

# Rust Engine
cd packages/neko-engine && cargo test
```
