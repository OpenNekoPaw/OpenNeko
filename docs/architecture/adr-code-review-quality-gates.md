# ADR: 代码审查与质量门禁

状态：Accepted
日期：2026-06-15
范围：全仓库 TypeScript、React Webview、VSCode Extension、Rust Engine、Proto、文档、打包和 OpenSpec 变更。

本文记录当前稳定的代码审查与质量门禁规则。它补充根目录 `AGENTS.md`、`ARCHITECTURE_CN.md`、`CONTRIBUTING_CN.md` 和 `openspec/project.md`，不保存单次实现日志或历史进度。

## 决策

OpenNeko 采用“架构优先、契约优先、风险分级、证据驱动”的质量门禁。

所有非平凡变更在实现或交付前必须回答：

1. 是否符合现有架构？
2. 如何进一步降低耦合？
3. 是否易于扩展与测试？

多模块改动或新功能还必须做五层分析：

| 层面 | 检查点                                                               |
| ---- | -------------------------------------------------------------------- |
| 职责 | 谁拥有数据、行为、生命周期和清理？                                   |
| 依赖 | L0/L1/L2、Webview/Extension、TS/Rust 和包边界是否正确？              |
| 接口 | DTO、message、schema、Proto、command 和 extension API 是否小而稳定？ |
| 扩展 | 下一类相似能力是否能通过 port、registry、strategy 或事件扩展？       |
| 测试 | 哪些行为由单元、契约、集成、smoke、VSCode 验证或人工证据覆盖？       |

## 风险等级

| 等级 | 适用改动                                                                | 最低验证期望                                                                 |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| L0   | 文档、文案、低风险单文件修复                                            | 聚焦检查、文档 review 或截图。                                               |
| L1   | 局部组件、hook、service、state 逻辑                                     | 聚焦单元测试和相关包 build/typecheck。                                       |
| L2   | Webview/Extension message、共享包、公共类型、EngineClient、跨包契约     | 契约测试、message/schema 测试、依赖边界检查和相关包 build。                  |
| L3   | Rust Engine、Proto、媒体流、渲染、项目格式、AI workflow、打包、资源访问 | 架构 review、单元/契约/集成测试、smoke 或 fixture 验证，必要时性能/UX 证据。 |
| L4   | release、安装、重大 UX、核心创作工作流                                  | 完整本地/CI 门禁、安装或运行 smoke、UX 证据和明确残余风险。                  |

## 通用检查

- 不新增生产 `any`、不安全 `as Type` 或正式 `console.log` 日志。
- 不破坏 TypeScript `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`。
- 设计复杂度符合本地 VSCode 客户端 + 本地 Rust Engine 的产品边界；避免为了假想云端多租户、分布式服务治理、远程规模或未知未来需求引入无调用方的 interface、factory、registry、strategy、plugin hook、feature flag、配置层或协议层。
- 防御性代码只覆盖真实运行边界：VSCode/Webview 沙箱、CSP、Extension/Engine 通信、本地文件与路径、媒体 codec/Range、异步取消与资源释放、外部 AI/market provider、用户数据和安全/信任边界；宽泛 `try/catch`、静默默认值、fallback、重复校验、no-op guard 或吞错不能掩盖本应失败的开发错误。
- 默认采用 fail-visible：contract mismatch、不可达状态、未实现路径、缺失依赖、非法 message、未知 schema/version、错误配置或未注册 handler/renderer/adapter 应直接抛错、返回明确 diagnostic 或让测试失败；只有保护用户数据、外部 provider、发布兼容或安全/信任边界时，才允许显式恢复、迁移或降级。
- Webview 不导入 `vscode`、Node API 或 Extension 实现。
- Extension Host 不导入 React/ReactDOM 或 Webview 实现。
- TypeScript 不重复 Rust Engine 已拥有的权威计算。
- Protobuf 和共享契约仍是跨层类型单一事实来源。
- 持久项目数据使用相对路径、`${VAR}/path`、stable refs、asset/entity ID 或 document locator，不保存 Webview URI、blob URL、stream ID、preview token 或 engine token。
- 文件、文档、媒体、模型、缩略图、preview/proxy、导入、导出或跨包传递必须经过统一内容访问、资源缓存、LocalResourceAccess、EngineClient、路径解析、ingest 或项目文件服务中对应的 owning boundary；功能包只实现 provider/adapter 和领域语义，不重新实现 cache manager、path resolver、Webview URI 投影或 Engine file-token policy。
- 缓存是透明、可重建的派生状态；业务逻辑、Agent 工具、Webview、Canvas 节点、Storyboard、Composite artifact 和跨插件 payload 不得把 `.neko/.cache` 目录结构、cache manifest、materialized path、`cachePath`、`runtimePath`、`cacheResourceRef`、Webview URI、blob/object URL、Engine token、preview token 或 scratch path 当作 durable identity。
- Webview 可访问 URI 只能由 `LocalResourceAccessService` 或 `ResourceCacheService.project()` 在授权后生成；投影失败必须返回明确 diagnostic、缺省 renderable projection 或 fail closed，不能回退为 raw local/cache/source path。
- 异步流程处理错误、取消、超时、资源释放和竞态边界。
- 公共契约、关键分支和失败路径有测试或明确残余风险。
- 影响行为、架构、配置、包入口或公共契约时同步更新对应文档。

## 三类验证入口

OpenNeko 使用本地开发、手动远程验证和合并验收三类入口。`dev` 是正常开发分支，普通 push 不自动触发 GitHub Actions；`main` 是发布分支，只接受 `dev -> main` Pull Request。

| 入口                    | 稳定入口           | 验证范围                                                                                                              | 权威信号                     |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| dev 本地提交前          | `pnpm gate:local`  | format、lint、build、普通 workspace tests（无 coverage）、仓库质量门禁，以及存在时的本机 VS Code 配置审计             | 本地命令退出码               |
| 手动 GitHub runner 验证 | `pnpm gate:remote` | coverage 源码门禁、完整 Rust/Proto/OpenSpec、仓库质量和所有支持平台 VSIX 打包；不包含 PR-only dependency review       | GitHub Actions `Manual Gate` |
| dev 合入 main           | `dev -> main` PR   | 与 Manual Gate 相同的共享 job graph，加唯一 promotion source 和 dependency review；任一 required job 不成功都阻止合并 | GitHub Actions `Merge Gate`  |

`gate:local` 不收集 coverage，用于提交前完整反馈；`check:fast` 只是迭代期快速检查，不能替代提交前门禁。`gate:remote` 提供 Manual/Merge 源码部分的串行本地复现，macOS/Linux package matrix 仍由 GitHub Actions 并行 job 拥有。

main 分支保护必须将 GitHub Actions `Merge Gate` 配置为唯一 required check，并要求分支与最新 main 同步。Merge Gate 必须验证 head 为 dev、base 为 main；普通 dev push 不执行远程 workflow。新增确定性阻断 job 时，必须同步加入 Manual/Merge aggregator 的 `needs` 与 required-success 列表；required job 缺失、跳过、失败、取消或返回未知状态必须 fail-visible。

远端 Manual/Merge Gate 只允许运行干净 checkout 可重现的 build、固定 unit/contract tests、coverage、静态质量与发布矩阵；不得读取 gitignored `.vscode`、启动 VS Code/GUI、依赖真实用户 fixture、读取 provider credential 或访问真实 API。现有 package 单元测试的发现范围仍由 owning package 管理，门禁编排不得借机复制业务测试逻辑。

本地 VS Code 配置审计由 `test:local:vscode` 显式拥有并接入 `gate:local`；配置完全不存在时报告 skip，只存在 `launch.json` / `tasks.json` 之一时 fail-visible。GUI/Extension Development Host 与真实 API/provider 验收分别通过 `test:local:ui`、`test:local:api` 及对应 Skill/runner 显式执行，不作为普通本地 gate 的隐式依赖，避免自动打开窗口、消耗外部额度或读取凭据。

## 验证命令矩阵

按影响范围选择最小可靠验证，并在交付说明或 PR 中记录命令和结果。

| 范围                            | 推荐命令                                                      |
| ------------------------------- | ------------------------------------------------------------- |
| TS / Webview / Extension 提交前 | `pnpm gate:local`                                             |
| Manual/Merge 源码门禁本地复现   | `pnpm gate:remote`                                            |
| Rust Engine                     | `pnpm ci:local:rust`                                          |
| Proto 契约                      | `pnpm ci:local:proto`                                         |
| 架构边界                        | `pnpm check`                                                  |
| 未使用/冗余代码                 | `pnpm check:unused`                                           |
| Agent 边界                      | `pnpm check:agent-boundaries`                                 |
| Agent eval harness（key-free）  | `pnpm test:agent:eval`                                        |
| 本机 VS Code 配置审计           | `pnpm test:local:vscode`                                      |
| 本机 Webview/GUI target 预检    | `pnpm test:local:ui`                                          |
| 真实 API/provider Agent case    | `pnpm test:local:api -- --mode ...`                           |
| 3D Route A 边界                 | `pnpm check:3d-route-a-boundaries`                            |
| 残留/债务关键词扫描             | `pnpm check:legacy-debt`                                      |
| 代码债务台账                    | `pnpm check:legacy-debt:ledger`                               |
| 质量门禁组合                    | `pnpm check:quality`                                          |
| Engine runtime smoke            | `pnpm smoke:engine`                                           |
| Webview build smoke             | `pnpm smoke:webview`                                          |
| Webview target smoke            | `pnpm smoke:webview:targets`                                  |
| VS Code debugger target smoke   | `pnpm smoke:vscode:targets -- --skill <skill>`                |
| Webview functional acceptance   | 本地 Extension Development Host + `vscode-extension-debugger` |
| GitHub Actions 形状预检         | `pnpm ci:act`                                                 |

`ci:local` 是 `gate:local` 的兼容别名，`ci:remote` 是 `gate:remote` 的兼容别名，`check:ci` 是远程源码门禁的基础组合。`act` 只是本地 Linux job 形状预检，不替代 GitHub Actions。Rust macOS runner和平台打包以 `Manual Gate` / `Merge Gate` 为准；正式发布只由 main 历史上的版本标签触发。

代码债务、边界例外、发布通道等机器可读门禁输入放在 `quality/`，由脚本和 CI 消费；本文只记录质量政策、验证矩阵和人工 review 边界。

开发验证中若新增、修改或移除 `legacy`、`fallback`、`deprecated`、`compat`、`shim`、`dirty`、`hack`、`temporary`、`workaround`、dead code、unused 或 duplicate 相关代码，交付说明或 PR 必须记录 `pnpm check:legacy-debt`、`pnpm check:unused`，或说明已由 `pnpm ci:local` / `pnpm check:quality` 覆盖。

## Agent Debug Automation 证据

影响 AgentSession 多轮流程、对话历史、turn 执行、反馈提示词流、Skill 生命周期、Agent-owned Skill 触发、capability/tool 注册或路由、provider/model 路由、controller/judge 行为、异步任务观察、产物生成工作流或真实 API 场景验收的变更，应使用 `.codex/skills/neko-agent-evaluation/SKILL.md` 规划并记录聚焦的 TUI debug automation 证据。

每项受影响行为必须先做一个 `reuse | update | create | excluded` authoring 决策，并记录 target owner、user behavior、canonical path、forbidden fallback、observable evidence、expected result/failure 和九类 coverage delta。changed path 没有 suite owner 时必须 fail-visible；`excluded` 只能用于确定性验证足以证明真实 Agent 行为不会改变的情况。

`pnpm test:agent:eval` 验证 strict v2 suite/scenario、runner/protocol、assertion/Judge parser、报告、失败分类和所有 indexed suite dry-run；它是本地显式门禁，不进入 GitHub Actions 或通用 CI 命令，也不等于真实 Agent 行为验收。TUI debug automation 真实 case 同样由开发者在本地显式执行，不提供 mock lane。外部 eval 脚本可以负责 authoring、suite、controller、Judge、check、comparison 和 report，但不得 import Agent、Canvas、media、Skill 或 provider 的业务内部实现来替代真实 TUI 行为。

debug automation 必须复用完整 TUI App/session owner，并通过 TUI 输入队列提交消息。直接调用 Agent turn runner、绕过 TUI 输入队列或替换 runtime assembly 的结果不能作为 debug automation evidence。

协议 parser、invalid request、stdio framing、timeout classification 等 debug protocol 单元测试可以 key-free；但 Agent behavior acceptance 必须使用真实配置 API，不得使用 mock provider 或 eval-only fake business tools。

Skill suite 必须绑定 portable name、Host source/provenance/root/location 和 Host-computed fingerprint。同名 Skill 不得只按名称或隐藏优先级选择；Market package id、semver、发布、安装和分发状态不能替代本地开发 identity。runtime/model matrix 只能使用 canonical TUI 支持的 session-scoped immutable 配置，并从 facts 证明 requested/effective identity 与 digest；不得新增 eval-only runtime flag。

交付说明或 PR 中的 debug automation 证据应包含：

- suite/case/run id，以及 `reuse/update/create/excluded` decision 或 intended suite。
- 实际命令，例如 `node scripts/agent-eval/protocol-smoke.mjs --suite <suite-id> --case <case-id>`；脚本应通过通用 debug automation 接口驱动 TUI runtime。
- `reports/agent-eval/` 下的 `result.json`、`evidence.json`、`artifact-manifest.json`、`quality-report.md`、可选 Judge/aggregate/baseline diff 路径和退出码。
- target identity/fingerprint、target/controller/Judge provider/model、effective configuration、fixture digest、usage 和 cost availability。
- hard-gate、no-fallback、artifact validator、dropped-count 和 failure-attribution evidence refs。
- 若未运行，明确记录阻塞原因，例如 credentials、provider availability、network、quota、model access、local workspace fixture、controller model 或 judge model 不可用。
- 未执行/blocked suite、skipped stage 和剩余风险。

证据结论必须以当前 runner 实际执行的 assertion evaluator 为准。未知字段或没有 evaluator 的 assertion 必须在 TUI spawn 前 configuration invalid；仅有 dry-run、进程退出码、Judge 高分或非空最终回答不得替代 canonical-path、effective config 和 forbidden-fallback 证据。事实集合有 dropped count 时，依赖该事实的 assertion 必须失败或 blocked。

自然语言 Skill 触发证据必须区分 Agent 主动激活 Skill 和“没有激活但输出看起来不错”。对 `trigger: "natural-language"` 的 Skill case，缺少 Agent-owned activation 应视为 case fail，而不是通过 judge 文本弥补。

Mock-only、direct-turn-injection-only、final-text-only、browser-only、jsdom-only、普通 TUI UI smoke、旧 `neko run` 单轮结果或旧 headless eval 结果不能声称满足 debug automation evidence；它们只能作为相邻验证记录。

GitHub Actions 和 `check:test`、`check:ci`、`ci:local` 等通用 CI 组合不得触发 key-free harness、focused case、重复 matrix、provider-backed behavior、Evaluation credential 或报告上传。所有 Evaluation 必须由开发者从本地 checkout 显式执行；缺少 credential、network、quota、model、config 或 fixture 时必须输出 infrastructure blocked/fail evidence，不能用 mock/default fallback 继续成功。

原始 Evaluation 报告写入 gitignored `reports/agent-eval/`，本地按 14 天保留策略由开发者负责清理。OpenSpec、PR 和长期文档只提交通过 allowlist 的脱敏 summary/baseline；必须移除 credential、hidden prompt body、raw provider config、absolute user path、cache/temp/Webview/runtime handle、raw log 和未授权内容，同时保留稳定 suite/case/run、identity、assertion/artifact refs、failure classification 和 residual risk。

## 新需求可行性检查

L3/L4 变更在大规模实现前必须先证明关键路径可行：可以通过 spike、fixture、失败测试、Engine smoke、Webview target smoke、VSCode debugger Skill target smoke、VSCode 调试证据或原型完成。可行性证据写入 OpenSpec design/tasks；若无法运行，必须记录原因、风险和后续关闭方式。可行性 spike 不能替代最终功能验收。

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
- 新路径验收必须是路径级验收，不得只断言最终结果成功；review 必须确认测试断言 canonical path、新 handler、新 renderer、新 adapter 或新 contract 被命中，并通过 spy、counter、log assertion 或将 legacy path poison 成抛错来证明旧路径未参与。
- 验证必须证明 canonical path 默认命中；如果 legacy path 仍可触发，必须有显式 feature flag、迁移入口、fail-closed diagnostic、telemetry/log assertion 或测试覆盖，并断言旧路径不会为新路径请求返回成功结果。
- legacy fixture、旧字段 fallback、旧 message handler、旧 renderer 或旧 command alias 的测试不能作为新路径完成证据，只能作为迁移/诊断证据。
- VS Code、Node、pnpm、Rust、OS、Webview sandbox、CSP、codec、Range、Engine、Proto、marketplace trust 和安全边界不能以“未发布”为由忽略。
- 有价值的本地项目数据、用户设置、trust state、entitlement、插件安装记录和生成产物不能静默丢失；必须迁移、重建、提示确认或 fail-closed。

## Engine 与 Webview 专项约束

Engine 变更涉及 Rust action、stream、file access、runtime state、native packaging 或 EngineClient contract 时，应单独记录 Rust/Proto/client/fixture/smoke 验证。Webview 变更涉及 runtime behavior、Extension/Webview message、layout、keyboard/focus、i18n、VSCode lifecycle、CSP、媒体 codec 兼容或 Range/seek 读取时，应单独记录 message contract、focused build/test、CSP/HTML helper 测试、Engine file-access 测试，以及通过本地 Extension Development Host 与 `vscode-extension-debugger` 执行的真实功能场景。UI 运行态测试不得进入 CI。

普通浏览器、Chrome、Browser 插件、Playwright 或 Vite/localhost 只能作为热重载和显式浏览器兼容性辅助；它们不经过 VS Code Webview CSP、`webview.asWebviewUri(...)`、Extension/Webview message、焦点生命周期或 VS Code 主题注入，因此不能作为 Extension Webview 视觉/交互变更的默认验收证据。此类变更必须在本地使用 Extension Development Host + `vscode-extension-debugger` Skill 运行受影响的真实功能场景；`pnpm smoke:webview:targets` 只证明 page/Webview target 可发现。若功能场景无法运行，必须记录阻塞条件、剩余风险和关闭方式。

### Webview 功能场景与证据治理

- owning package 维护自己的合成 fixture、用户操作、业务断言、canonical path 和 authoritative side effect；共享 runner 只维护宿主生命周期、CDP adapter、封闭操作 schema、错误分类、脱敏和报告格式。
- 场景必须通过可见 UI、公开 VS Code/Electron 命令或消息边界和 owning project/Engine service 完成；不得直接写 fixture 文件来伪造 UI 成功，不得调用私有 store/handler，也不得增加 test-only 业务成功入口。
- 原始 `result.json`、step/assertion evidence、DOM、日志、截图和 side-effect manifest 写入 gitignored `reports/webview-functional/`。本地证据按排障需要短期保留；可信 PR CI artifact 默认保留 14 天，nightly/release 可在对应 workflow 中显式设置不同期限。
- 截图和 DOM 只能来自隔离 fixture workspace。不得采集普通开发窗口、真实用户工作区、用户配置、凭据、secret storage、token 或无关本机内容；误采集时必须立即删除，不能引用或提交。
- OpenSpec、PR 和长期文档只提交脱敏摘要，包含 scenario id、命令、宿主/扩展版本、fixture identity、结果、失败分类、证据位置和剩余风险。报告 schema 未知、脱敏失败或证据越出 scenario report root 时必须 fail-visible。

VS Code/Electron 在创建任意 Webview 编辑器或 Webview View 时，可能在 DevTools 中输出以下容器级 warning：

- `Unrecognized feature: 'local-network-access'`
- `An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.`

这些 warning 来自 VS Code Workbench 的 Webview iframe 创建逻辑，不由 Neko 的 Webview HTML、CSP、`webview.options` 或业务脚本产生。若堆栈指向 `webviewElement.ts`、`overlayWebview.ts`、`customEditorInput.ts` 或 `webviewEditor.ts`，它们应在运行态验收中作为已知良性容器 warning 过滤；不得把它们当作 Canvas/Cut/Audio/Model 等编辑器保存、路径、媒体或 CSP 的失败证据。仍需追踪 Neko 自身 logger、CSP violation、`preview:*`、`media:*`、`Failed to save NK*` 等业务错误。

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

- 是否优先复用或更新 `@neko/shared`、`@neko/ui`、`@neko/neko-client`、`@neko/proto`、`@neko/entity`、`@neko/search`、project-file-io、resource cache 或既有 domain service。
- 是否避免了 package-local design system、theme token、i18n runtime、logger/error 类型、项目文件 IO、cache manager、path resolver、Engine HTTP/WS client 或共享 DTO 的并行实现。
- 如果公共入口缺少能力，是否优先扩展公共契约、公共 adapter、公共 hook/primitive 或 domain service，而不是复制一份功能包私有实现。
- 如果能力留在 owning package，是否说明了业务边界、依赖方向、后续提取条件和验证命令。

缺少公共基础能力审计的新横切能力，应视为架构风险；若影响多个包或公共契约，应进入 OpenSpec proposal/design 后再实现。

### 内容访问、透明缓存与路径解析审计

当变更涉及文件、文档、媒体、模型、PSD、字幕、附件、缩略图、preview variant、proxy、OCR/ASR/metadata sidecar、导入、导出、Send to Canvas/Storyboard、Agent 工具或跨包资源传递时，review 必须额外确认：

- 调用方是否只声明 intent、source/ref、target 和 caller，由 Host 侧统一内容访问边界选择 source、cache、proxy、bytes、Engine source 或 Webview projection。
- 二进制/媒体/container entry 是否经 Engine-backed content access 或注册 provider；纯文本、配置和 `nk*` 项目事实是否经项目文件/text 服务，且没有误进资源缓存。
- 缓存路径、manifest、document-reader scratch、system temp、Webview URI、blob/object URL、Engine token 和 preview URL 是否只存在于 runtime/projection/diagnostic，不进入 durable payload、Agent memory、Canvas node、Storyboard row、artifact 或剪贴板稳定引用。
- generated 输出是否按 scratch / draft / promoted source / derivative 分类：draft 只能作为当前会话 projection；promoted source 必须在 `.neko/.cache` 外；ResourceCache 只能保存 thumbnail/preview/proxy/metadata 等可重建 derivative，不能保存 generated source variant。
- Webview 展示是否通过 `LocalResourceAccessService` 或 `ResourceCacheService.project()` 生成授权 URI；失败时是否 fail-visible，而不是返回 raw local path、cache path 或未验证 source URL。
- 新增 provider/adapter 是否接入 `@neko/shared/vscode/extension` 的 content-access/resource-cache/local-resource factory，或明确说明为什么 owning package 是唯一合理边界。
- 测试是否是路径级验收：断言 canonical service/provider/message/adapter 被命中，并证明 direct fs read、cache-path lookup、legacy field fallback、package-local path conversion 或 Webview URI fallback 没有参与。

缺少这组审计的内容路径变更，应至少视为 L2；涉及 Engine file access、media stream、document container、Agent tool 或跨包 payload 时，默认按 L3 review。

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
  -> residual risk or archive
```

非平凡变更交付时应说明：

- 主用户路径是否覆盖。
- 是否违反 proposal non-goals。
- 每个新增公共契约或关键 scenario 对应哪个测试或 smoke。
- 哪些验证未运行以及原因。
- 剩余风险进入 OpenSpec follow-up、`TODO_CN.md` / `TODO.md`、`ROADMAP_CN.md` / `ROADMAP.md` 或带日期的 `docs/status/` 快照。

## 自动化与人工边界

机器检查负责格式、类型、依赖、台账、契约和可重复测试。人工 review 负责架构取舍、功能偏离、UX、专业创作工作流、性能解释和残余风险判断。

新增质量工具时，应优先接入现有脚本或 OpenSpec validation tasks，避免形成只靠口头约定的并行流程。
