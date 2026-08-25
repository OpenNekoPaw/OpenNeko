# ADR: 代码审查与质量门禁

状态：Accepted
日期：2026-07-31
范围：全仓库 TypeScript、React renderer/Webview、Electron Desktop、Node/FFmpeg、Proto、文档、打包和 OpenSpec 变更。

本文记录当前稳定的代码审查与质量门禁规则。它补充根目录 `AGENTS.md` 和
`openspec/project.md`，不保存单次实现日志或历史进度。

## 决策

OpenNeko 采用“架构优先、契约优先、风险分级、证据驱动”的质量门禁。

所有非平凡变更在实现或交付前必须回答：

1. 是否符合现有架构？
2. 如何进一步降低耦合？
3. 是否易于扩展与测试？

多模块改动或新功能还必须做五层分析：

| 层面 | 检查点                                                                   |
| ---- | ------------------------------------------------------------------------ |
| 职责 | 谁拥有数据、行为、生命周期和清理？                                       |
| 依赖 | L0/L1/L2、Main/preload/renderer、TS/Node 和包边界是否正确？              |
| 接口 | DTO、IPC message、schema、Proto 和 package API 是否小而稳定？            |
| 扩展 | 下一类相似能力是否能通过 port、registry、strategy 或事件扩展？           |
| 测试 | 哪些行为由单元、契约、集成、smoke、Electron Desktop 验证或人工证据覆盖？ |

## 风险等级

| 等级 | 适用改动                                                                | 最低验证期望                                                                 |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| L0   | 文档、文案、低风险单文件修复                                            | 聚焦检查、文档 review 或截图。                                               |
| L1   | 局部组件、hook、service、state 逻辑                                     | 聚焦单元测试和相关包 build/typecheck。                                       |
| L2   | renderer/Desktop IPC、共享包、公共类型、媒体 port、跨包契约             | 契约测试、message/schema 测试、依赖边界检查和相关包 build。                  |
| L3   | Node/FFmpeg、Proto、媒体流、渲染、项目格式、AI workflow、打包、资源访问 | 架构 review、单元/契约/集成测试、smoke 或 fixture 验证，必要时性能/UX 证据。 |
| L4   | release、安装、重大 UX、核心创作工作流                                  | 完整本地/CI 门禁、安装或运行 smoke、UX 证据和明确残余风险。                  |

## OpenSpec 适用边界

OpenSpec 只约束能够独立命名的系统级或产品级功能变更，并且必须改变系统能力边界、核心产品工作流、
持久用户事实或安全/信任边界。提案在实施前建立，只冻结产品意图、系统边界和产品级验收。

局部 UI/交互、缺陷、性能、重构、清理、包/目录/内部 contract 调整、测试/质量门禁、构建/依赖/工具及
inventory/audit/status 不使用 OpenSpec。它们直接修改代码和测试，必要证据进入提交、PR、交付说明或
gitignored report，不创建 research/status/verification 文档。代码已经形成 canonical path、只剩局部修补或
补充验证时，删除提案；task 只保留少量产品里程碑，不跟踪代码实现进度。

## 通用检查

- 不新增生产 `any`、不安全 `as Type` 或正式 `console.log` 日志。
- 不破坏 TypeScript `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`。
- 设计复杂度符合本地 Electron Desktop + Node/FFmpeg 的产品边界；避免为了假想云端多租户、分布式服务治理、远程规模或未知未来需求引入无调用方的 interface、factory、registry、strategy、plugin hook、feature flag、配置层或协议层。
- 防御性代码只覆盖真实运行边界：Main/preload/renderer 隔离、CSP、typed IPC、本地文件与路径、媒体 codec/Range、异步取消与资源释放、外部 AI/market provider、用户数据和安全/信任边界；宽泛 `try/catch`、静默默认值、fallback、重复校验、no-op guard 或吞错不能掩盖本应失败的开发错误。
- 默认采用 fail-visible：contract mismatch、不可达状态、未实现路径、缺失依赖、非法 message、
  未知字段、非 canonical shape、不受支持的外部协议版本、错误配置或未注册
  handler/renderer/adapter 应直接抛错、返回明确 diagnostic 或让测试失败；只有保护用户数据、
  外部 provider、发布兼容或安全/信任边界时，才允许显式恢复或降级，内部数据修复必须位于产品外。
- Renderer/Webview 不导入 Electron、Node API 或 Desktop Main/preload 实现。
- Desktop Main 不导入 React/ReactDOM 或 Webview 实现；preload 不暴露通用 IPC/Node 能力。
- TypeScript domain 层不重复 Node/FFmpeg adapter 已拥有的媒体执行职责。
- Protobuf 和共享契约仍是跨层类型单一事实来源。
- 持久项目数据使用相对路径、`${VAR}/path`、stable refs、asset/entity ID 或 document locator，不保存 Renderer URL、blob URL、stream ID、preview token 或 runtime token。
- 文件、文档、媒体、模型、缩略图、preview/proxy、导入、导出或跨包传递必须经过 `ContentReadService`、`ContentRepresentationService`、capability-scoped runtime projection、authorized writer、领域媒体 port 或项目文件服务中对应的 owning boundary；功能包只实现 storage-neutral generator/adapter 和领域语义，不重新实现 cache manager、path resolver、Webview URI 投影或 loopback token/Range policy。
- 缓存是透明、可重建的派生状态；业务逻辑、Agent 工具、Renderer、Canvas 节点、Storyboard、Composite artifact 和跨插件 payload 不得把 `.neko/.cache` 目录结构、cache manifest、materialized path、`cachePath`、`runtimePath`、`cacheResourceRef`、Renderer URL、blob/object URL、runtime token、preview token 或 scratch path 当作 durable identity。
- Webview 可访问 URI 只能由 Host 注入的 `WebviewContentProjectionPort` 在授权后生成；`LocalResourceAccessService` 只存在于该 Host adapter 内。投影失败必须返回明确 diagnostic 或 fail closed，不能回退为 raw local/cache/source path。
- 异步流程处理错误、取消、超时、资源释放和竞态边界。
- 公共契约、关键分支和失败路径有测试或明确残余风险。
- 仅当系统架构、开发规范或核心产品设计发生变化时更新对应文档；普通行为、配置、包入口和内部契约变化以代码与测试为准。

## Package 与 Desktop ownership evidence

新增或实质修改 `apps/*`、`packages/*` 生产模块时，质量 review 必须提供以下结构化证据。
产品功能变更的 OpenSpec 只保存稳定产品边界和产品级里程碑，不复制以下实现证据：

| 字段                  | 必须回答                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Owning responsibility | 谁拥有规则、状态、生命周期、错误和数据；不能只写当前文件或 Desktop                               |
| Package role          | contracts/domain/application/runtime/node/webview/infrastructure/testing/content-only 中的哪一类 |
| Canonical path        | 唯一 public export、port、handler/adapter 和调用链；旧路径如何删除或 fail-closed                 |
| Producer / consumer   | 哪个模块产生 contract/事实，哪些真实生产调用方消费，依赖是否在 manifest 声明                     |
| Runtime boundary      | host-neutral、Node、browser、Electron Main/preload/renderer 的能力与资源 owner                   |
| Verification          | producer test、consumer/delegation test、路径断言，以及适用的 Node/Electron 运行态命令           |
| User data             | project/settings/credential/SQLite/生成产物是保留、迁移、重建、拒绝还是有意丢弃                  |

只写“当前只有 Desktop”“只有一个调用方”或最终测试结果，不构成 ownership/canonical-path 证据。
Application 层保留生产逻辑时必须说明其 Electron trust/window/lifecycle 依赖，以及为何无法通过窄 port
成为 host-neutral domain/application service。缺少上述证据时不得将架构任务标记完成。

机器门禁使用 `quality/package-roles.json` 和
`quality/ledgers/package-boundary-exceptions.json` 验证 package 覆盖、角色、依赖、exports、identity 和
source alias；当前例外必须有 owner 和 removal task，新增例外默认失败，已经消失的例外必须同步删除。

## 三类验证入口

OpenNeko 使用本地开发、手动远程验证和合并验收三类入口。除 `main` 外的非空分支名都属于开发分支，普通开发分支 push 不自动触发 GitHub Actions；`main` 是唯一发布分支，只接受开发分支到 `main` 的 Pull Request。

| 入口                    | 稳定入口           | 验证范围                                                                                                               | 权威信号                     |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 开发分支本地提交前      | `pnpm gate:local`  | format、lint、build、普通 workspace tests（无 coverage）和仓库质量门禁                                                 | 本地命令退出码               |
| 手动 GitHub runner 验证 | `pnpm gate:remote` | coverage 源码门禁、完整 Proto/OpenSpec 和仓库质量；不包含原生 Desktop 构建、GUI、真实 API 或 PR-only dependency review | GitHub Actions `Manual Gate` |
| 开发分支合入 main       | 开发分支到 main PR | 与 Manual Gate 相同的共享 job graph，加唯一 promotion source 和 dependency review；任一 required job 不成功都阻止合并  | GitHub Actions `Merge Gate`  |

`gate:local` 不收集 coverage，用于提交前完整反馈；`check:fast` 只是迭代期快速检查，不能替代提交前门禁。`gate:remote` 提供 Manual/Merge 源码部分的串行本地复现。

main 分支保护必须将 GitHub Actions `Merge Gate` 配置为唯一 required check，并要求分支与最新 main 同步。Merge Gate 必须验证 base 为 main、head 非空且不为 main；普通开发分支 push 不执行远程 workflow。新增确定性阻断 job 时，必须同步加入 Manual/Merge aggregator 的 `needs` 与 required-success 列表；required job 缺失、跳过、失败、取消或返回未知状态必须 fail-visible。

远端 Manual/Merge Gate 只允许运行干净 checkout 可重现的 build、固定 unit/contract tests、
coverage 和静态质量；不得启动 Electron GUI、依赖真实用户 fixture、读取 provider credential
或访问真实 API。现有 package 单元测试的发现范围仍由 owning package 管理，门禁编排不得
借机复制业务测试逻辑。真实 Desktop UI 与 API/provider 验收由本地显式场景拥有，不作为
普通 gate 的隐式依赖。

## 验证命令矩阵

按影响范围选择最小可靠验证，并在交付说明或 PR 中记录命令和结果。

| 范围                           | 推荐命令                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| TS / Desktop 提交前            | `pnpm gate:local`                                                   |
| Linux host-neutral build       | `pnpm check:static-build`                                           |
| Manual/Merge 源码门禁本地复现  | `pnpm gate:remote`                                                  |
| Wire/跨层契约                  | owning package contract tests + `pnpm check:application-boundaries` |
| 架构边界                       | `pnpm check`                                                        |
| 未使用/冗余代码                | `pnpm check:unused`                                                 |
| Agent 边界                     | `pnpm check:agent-boundaries`                                       |
| Agent eval harness（key-free） | `pnpm test:agent:eval`                                              |
| 真实 API/provider Agent case   | `pnpm test:local:api -- --mode ...`                                 |
| Desktop headless 功能路径      | `pnpm test:functional:headless`                                     |
| Desktop 图形化 UI 验收         | `pnpm test:local:ui`                                                |
| 残留/债务关键词扫描            | `pnpm check:legacy-debt`                                            |
| 质量门禁组合                   | `pnpm check:quality`                                                |
| Webview build smoke            | `pnpm smoke:webview`                                                |
| Desktop production package     | `pnpm package:desktop`                                              |
| Renderer functional acceptance | 本地真实 Electron Desktop + 隔离 fixture                            |
| GitHub Actions 形状预检        | `pnpm ci:act`                                                       |

`ci:local` 是 `gate:local` 的别名，`ci:remote` 是 `gate:remote` 的别名，`check:ci` 是远程
源码门禁的基础组合。`act` 只能预检 Linux host-neutral job 形状。GitHub Actions 不运行 Forge，
不构建或上传 Desktop 原生 artifact；Windows/Linux 只提供 platform-test 证据。原生 macOS
package 是本地发布与资格验收的显式证据，不属于 Manual/Merge Gate，也不替代真实 GUI、
安装、凭据与媒体场景。

CI 的测试证据分为全仓库 unit/contract coverage 与固定的 Desktop headless functional
流程。后者可跨 Main/preload/composition 验证产品路径，但不得启动 Electron GUI、读取真实
用户目录、使用 provider credential 或调用真实 AI API。Agent Evaluation key-free harness、真实
API/hidden Desktop case、重复 matrix、configuration/implementation ablation 与图形化 Electron UI
验收都必须由开发者通过显式本地命令启动，不得进入 GitHub Actions 或通用 CI script composition；
CI 只保留本地入口不可达的编排回归证据。

代码债务、边界例外、发布通道等机器可读门禁输入放在 `quality/`，由脚本和 CI 消费；本文只记录质量政策、验证矩阵和人工 review 边界。

开发验证中若新增、修改或移除 `legacy`、`fallback`、`deprecated`、`compat`、`shim`、`dirty`、`hack`、`temporary`、`workaround`、dead code、unused 或 duplicate 相关代码，交付说明或 PR 必须记录 `pnpm check:legacy-debt`、`pnpm check:unused`，或说明已由 `pnpm ci:local` / `pnpm check:quality` 覆盖。

## Agent Evaluation 证据

影响 DSH Session、多轮流程、Prompt/Skill、MCP/Tool routing、provider/model、附件/感知、异步任务、
产物生成或 Desktop event projection 的变更，应使用
`.codex/skills/neko-agent-evaluation/SKILL.md` 规划聚焦 evaluation。

`pnpm test:agent:eval` 只验证 strict suite/scenario、runner、assertion/Judge parser、报告和 indexed
dry-run，是 key-free harness 自测，不等于真实 Agent 行为验收。真实 case 必须复用完整
Desktop App/session owner，并通过公开 Composer input path 提交消息；直接调用 turn runner、
替换 runtime assembly 或使用 mock business tool 不能作为证据。

DSH canonical evaluation driver 必须通过完整 Desktop owner、ACP/DSH Session、公开 Composer、Conversation navigation、approval 与领域控件驱动。尚无 owning Desktop scenario adapter 的 case 必须返回 `infrastructure-blocked` 并记录缺失 owner；不得回退到已移除的 Pi/TUI/headless direct driver、单元 runner 或只凭最终文本宣称通过。

Agent 验收使用两条本地专用 lane。功能级验收必须从可见 Electron UI 的 composer、PrimarySidebar、
审批或领域控件发起真实 API 行为，并断言用户可见终态；批量回归必须以无可见 UI 的完整 Desktop
session owner 驱动同一公开 Agent input path 和真实 API。hidden lane 不等于 direct/headless Agent
runtime，不能跳过 Desktop composition、持久化或 projection。

基础回归矩阵包含：正常对话、上下文压缩后 continuation、完整重开后的 transcript 恢复、生成
Job/Tool/产物记录恢复、会话切换展示、会话隔离。DSH Session、持久化、生成 workflow 或 Desktop
projection 变更必须运行受影响子集并记录整套矩阵 disposition；发布验收必须关闭全部适用项。UI
报告与 batch report 均需记录 provider/model、Conversation/DSH Session/turn/step/toolCall identity、permission preset、Skill/MCP/attachment/media Tool/domain Job provenance、terminal state、canonical/no-fallback evidence 和脱敏 artifact refs。

原始 Evaluation 报告写入 gitignored `reports/agent-eval/`。长期文档只提交脱敏摘要，保留
suite/case/run、identity、assertion/artifact refs、failure classification 和 residual risk，
并移除 credential、hidden prompt、raw provider config、绝对用户路径与未授权内容。

## 新需求可行性检查

L3/L4 产品功能变更在大规模实现前必须先证明关键路径可行：可以通过 spike、fixture、失败测试、
Node/FFmpeg smoke、Desktop package、真实 Electron 场景或原型完成。可行性证据写入
OpenSpec design/tasks；若无法运行，必须记录原因、风险和后续关闭方式。可行性 spike
不能替代最终功能验收。

## Prelaunch 兼容策略

项目尚未发布时，可以选择显式破坏未发布的内部 API、DTO、Webview message、Agent workflow payload、测试 fixture 和 nk\* 草稿格式，用于移除 legacy debt 或保持 canonical 架构清晰。此类破坏性调整不需要为所有历史草稿保留长期兼容 shim。

但 prelaunch 不等于忽略版本兼容性。Review 必须确认：

- proposal/design 说明了破坏内容、原因和影响面。
- 旧数据处理策略明确：迁移、重建、重新导入、忽略或有意丢弃。
- load/save、contract fixture、失败 diagnostic、迁移或重建路径有验证任务。
- Prelaunch 重构必须先限定本次替换的最小目标边界，然后优先清理该边界内旧 compatibility shim、legacy adapter、fallback branch、dual-read/dual-write、旧字段映射和旧命令入口，并断开旧调用链路。Review 必须先确认旧路径不能继续返回成功，再接受新设计/新契约、新 canonical path 接入和验证证据；不得在旧路径仍可兜底成功时继续修补旧路径问题或把新功能接在新旧并行路径上。
- 兼容 shim 只有在保护有价值本地数据、已记录公共契约或外部信任边界时才保留，并且有 owner、replacement、验证命令、移除条件和到期任务。
- 开发和测试新路径时默认禁用兼容 fallback；若执行流命中旧路径，必须立即抛错、返回 fail-closed diagnostic 或触发可断言的 telemetry/log failure，不得继续返回旧路径成功结果；只有明确标记为迁移、拒绝或诊断测试时才可观测旧路径。
- 代码缺陷不得被兜底或兼容逻辑吞掉：缺失新实现、contract mismatch、非法状态、未知消息、错误配置、未注册 handler/renderer/adapter 时，应 fail-visible；不能回退旧实现、默认空数据、默认成功状态或 no-op。
- 新路径验收必须是路径级验收，不得只断言最终结果成功；review 必须确认测试断言 canonical path、新
  handler、新 renderer、新 adapter 或新 contract 被命中，并通过 spy、counter、log assertion 以及
  import/export/registration absence 证明旧路径未参与。
- 验证必须证明 canonical path 默认命中；如果 legacy path 仍可触发，必须有显式 feature flag、迁移入口、fail-closed diagnostic、telemetry/log assertion 或测试覆盖，并断言旧路径不会为新路径请求返回成功结果。
- legacy fixture、旧字段 fallback、旧 message handler、旧 renderer 或旧 command alias 的测试不能作为新路径完成证据，只能作为迁移/诊断证据。
- Electron、Node、pnpm、OS、renderer sandbox、CSP、codec、Range、FFmpeg、Proto、marketplace trust 和安全边界不能以“未发布”为由忽略。
- 有价值的本地项目数据、用户设置、trust state、entitlement、插件安装记录和生成产物不能静默丢失；必须迁移、重建、提示确认或 fail-closed。

## Desktop 与 Webview 专项约束

Node 媒体运行时变更涉及 FFmpeg job、stream、file access、runtime state、发布闭包或媒体
port contract 时，应单独记录 adapter/browser/fixture/smoke 验证。Renderer/Webview 变更涉及
runtime behavior、typed IPC、layout、keyboard/focus、i18n、窗口生命周期、CSP、媒体 codec
或 Range/seek 时，应记录 message contract、focused build/test、CSP/HTML helper、
loopback file-access 测试和真实 Electron 场景。UI 运行态测试不得进入 CI。

普通浏览器、Chrome、Browser 插件或 Vite/localhost 只能作为热重载和显式浏览器兼容性
辅助；它们不经过 preload、sender-bound IPC、Electron CSP、窗口/焦点和应用资源生命周期，
不能替代 Desktop 验收。

任何已实现的新增或实质变更用户可见 UI 行为，推荐使用
`.codex/skills/neko-ui-validation/SKILL.md` 作为唯一 UI 参考验证流程 owner。检查受影响功能清单时，分别记录
功能、视觉和适用的相邻回归证据；涉及 Desktop 边界时，真实 Electron 产品路径是权威运行时，
较窄的浏览器或组件运行时不得替代。任何必需项失败、阻塞、缺失或未执行时，该 UI 报告不得标记为通过；
无用户可见影响时必须记录 `not-applicable` 及原因。详细清单构建、执行和报告方法由该 Skill 单一维护，
本文不建立第二套流程。每个必需视觉状态必须由具备图像理解能力的 Agent 实际读取当前图像证据，并记录
对应状态、可观察结论与不确定性；截图存在、文件名、场景成功、DOM 数据或历史证据均不能替代视觉审阅。
UI 结果仅作非阻塞参考，不得影响代码质量门禁、任务完成、提交、合并或发布，也不得成为 required check。
图形化执行、视觉判断及其契约测试不得进入 `check:ci`、`gate:local`、`gate:remote`、`ci:*` 或 GitHub
Actions；通用门禁只可保留验证这些本地入口不可达的反向编排约束。

场景必须使用隔离合成 fixture，并通过可见 UI、public Desktop port 和 owning project/media
service 完成；不得读取真实用户工作区、配置、凭据或增加 test-only 成功入口。OpenSpec/PR
只提交脱敏摘要，包含 scenario id、命令、Desktop 版本、fixture identity、结果、失败分类、
证据位置和剩余风险。

## 组件复用审计

Webview/React 变更新增组件前，review 必须确认已经做过组件复用审计：

- 是否搜索过 `@neko/ui`、当前包 `components/`、`hooks/`、`shared/`、相邻领域包和已有测试。
- 是否可以通过增强已有组件的 prop、slot、variant、composition hook 或 package-local adapter 完成需求。
- 新组件与旧组件的职责、状态生命周期、交互契约、可访问性语义或领域边界是否真的不同。
- 如果跨两个以上 Webview 复用，是否应进入 `@neko/ui`；如果只服务某个领域，是否留在 owning package。
- PR/OpenSpec/交付说明是否记录了查过哪些组件、为何不复用、为何不抽共享层以及新增/回归测试。

没有复用审计证据的新增按钮、选择器、面板、空状态、工具栏、列表、卡片、输入区、Header/Input 等模式，应视为功能偏离或维护风险，而不是普通实现细节。

## 公共基础能力审计

新功能涉及组件样式、主题、国际化、日志、错误/诊断、配置、路径、文件保存/读写、资源授权、缓存、DTO 或跨包契约时，review 必须确认已经做过公共基础能力审计：

- 是否优先复用或更新 `@neko/shared`、`@neko/ui`、`@neko/media`、`@neko/entity-domain`、`@neko/search-domain`、project-file-io、resource cache 或既有 domain service。
- 是否避免了 package-local design system、theme token、i18n runtime、logger/error 类型、项目文件 IO、cache manager、path resolver、媒体 HTTP/WS client 或共享 DTO 的并行实现。
- 如果公共入口缺少能力，是否优先扩展公共契约、公共 adapter、公共 hook/primitive 或 domain service，而不是复制一份功能包私有实现。
- 如果能力留在 owning package，是否说明了业务边界、依赖方向、后续提取条件和验证命令。

缺少公共基础能力审计的新横切能力，应视为架构风险。若它新增或改变产品功能、运行时行为或公共契约
语义，应进入 OpenSpec proposal/design 后再实现；行为等价的跨包提取直接实施并在质量 review 中记录。

### 内容访问、透明缓存与路径解析审计

当变更涉及文件、文档、媒体、模型、PSD、字幕、附件、缩略图、preview variant、proxy、OCR/ASR/metadata sidecar、导入、导出、Send to Canvas/Storyboard、Agent 工具或跨包资源传递时，review 必须额外确认：

- 调用方是否使用 stable `ContentLocator` 和窄 `stat/read`、representation 或 capability-scoped projection port；不得通过 intent、target、materialization、qualityMode 或 caller 字符串自行选择 Host 路径与权限。
- 二进制/媒体/container entry 是否经 `@neko/media`、content access 或注册 provider；纯文本、配置和 `nk*` 项目事实是否经项目文件/text 服务，且没有误进资源缓存。
- 缓存路径、manifest、document-reader scratch、system temp、Renderer URL、blob/object URL、runtime token 和 preview URL 是否只存在于 runtime/projection/diagnostic，不进入 durable payload、Agent memory、Canvas node、Storyboard row、artifact 或剪贴板稳定引用。
- generated 输出是否按 scratch / draft / promoted source / derivative 分类：draft 只能作为当前会话 projection；promoted source 必须在 `.neko/.cache` 外；ResourceCache 只能保存 thumbnail/preview/proxy/metadata 等可重建 derivative，不能保存 generated source variant。
- Webview 展示是否通过 Host 注入的 `WebviewContentProjectionPort` 生成授权 URI；失败时是否 fail-visible，而不是返回 raw local path、cache path 或未验证 source URL。
- 新增 generator/adapter 是否接入共享 Host content composition，并保持 storage-neutral；产品包不得注册或持有 ResourceCache provider、manifest、root、GC 或生命周期。
- 测试是否是路径级验收：断言 canonical service/provider/message/adapter 被命中，并证明 direct fs read、cache-path lookup、legacy field fallback、package-local path conversion 或 Webview URI fallback 没有参与。

缺少这组审计的内容路径变更，应至少视为 L2；涉及媒体文件访问、media stream、document container、Agent tool 或跨包 payload 时，默认按 L3 review。

## 跨子包能力复用审计

新功能涉及 provider、registry、bridge、protocol、message router、status bar、tree view、file decoration、history、selection、recent items、projector、facade、command router、capability provider、store slice 或 workflow adapter 时，review 必须确认已经做过跨子包能力复用审计：

- 是否搜索过其他子包和共享层中同类能力、相同交互模式、相同 host adapter、相同协议形态或可复用测试。
- 两个以上子包需要同类能力时，是否优先提取为中立共享契约、domain service、adapter factory、registry、strategy、hook、test utility 或 `@neko/ui` primitive。
- 是否避免复制其他功能包实现，或直接 import 另一个功能包内部模块。
- 如果保留 package-local 实现，是否说明职责、生命周期、领域语义、依赖方向或运行环境为何不同。
- OpenSpec/PR/交付说明是否记录查过哪些包、为何不能复用、为何不抽共享层、后续提取条件和验证命令。

缺少跨子包能力复用审计的重复 provider/registry/bridge/protocol/status/tree/history/selection 等实现，应视为维护风险。需要共享时必须经公共包、public subpath、command/API facade、port、provider registry 或 domain service，而不是功能包互相依赖内部实现。

## 功能偏离检查

OpenSpec 变更必须把需求、实现和验证连起来：

```text
proposal / spec scenario
  -> design boundary
  -> task
  -> code change
  -> test / smoke / manual evidence
  -> residual risk / canonical promotion / proposal deletion
```

非平凡变更交付时应说明：

- 主用户路径是否覆盖。
- 是否违反 proposal non-goals。
- 每个新增公共契约或关键 scenario 对应哪个测试或 smoke。
- 哪些验证未运行以及原因。
- 功能剩余风险进入适用的 OpenSpec follow-up；非功能整改进入 `TODO_CN.md` / `TODO.md`，长期方向进入
  `ROADMAP_CN.md` / `ROADMAP.md`。

## 自动化与人工边界

机器检查负责格式、类型、依赖、台账、契约和可重复测试。人工 review 负责架构取舍、功能偏离、UX、专业创作工作流、性能解释和残余风险判断。

UI 参考验证可以组合自动化功能证据和人工视觉判断，并遵守 `neko-ui-validation` 的同一受影响功能清单、
权威运行时和 fail-visible 报告语义。其结果不参与代码完成判定；图形化 Electron 执行、视觉判断及相关
契约测试不纳入 CI 或通用 gate。

新增质量工具时，应优先接入现有脚本、稳定架构文档和聚焦自测，避免形成只靠口头约定的并行流程；
质量工具本身不得为此创建 OpenSpec。
