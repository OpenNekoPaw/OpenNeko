# Desktop Agent 客户端开源架构参考

日期：2026-07-22

更新日期：2026-07-27

范围：OpenCode、Zed、Craft Agents、Goose、Kun、Cindy 的 Desktop Shell、Agent runtime、会话/Thread、Tab/Panel/Window、扩展、Computer Use 和协议边界。本文是外部调研快照，不是 OpenNeko 的实现事实；稳定采用结论见 [`../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md`](../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md)、[`../architecture/adr-neko-desktop-home-project-profile-ux-boundary.md`](../architecture/adr-neko-desktop-home-project-profile-ux-boundary.md) 与 [`../architecture/adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](../architecture/adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)。

## 结论

六个项目共同证明：会话/Thread 是后台运行事实，Tab、Panel、Window 和 Sidebar item 是可关闭、可恢复的 UI 投影；Agent profile/mode/harness、会话、一次运行和子 Agent 也不是同一个对象。

它们采用了不同的客户端组织方式：

- OpenCode 重做 Electron Desktop，并由桌面进程监管本地 OpenCode server；
- Zed 在项目下组织并行 Thread，以统一 Threads Sidebar 承载内置 Agent、ACP External Agent 和 Terminal Thread；
- Craft Agents 使用 Electron main/preload/React renderer，围绕 workspace、session、source 和结果交付建立自己的工作台；
- Goose 使用 Electron/React 客户端启动 Rust `goose` CLI，并通过 ACP 连接 Agent backend。
- Kun 使用 Electron 连接唯一 `kun serve` 本地 HTTP/SSE runtime，让 Code、Design、Write 和手机连接共享线程、审批、工具与事件；
- Cindy 以 Electron Desktop、React Native Mobile 和共享 packages 连接多个 harness、模型、插件、设备和远程入口，并把插件运行在独立 Electron 沙箱进程中。

OpenCode、Craft Agents、Goose、Kun 和 Cindy 选择独立 Desktop Shell，Zed 则证明现有编辑器也可以通过明确 Thread owner 和 backend adapter 支持并行 Agent。共同点不是某个 UI 框架，而是把产品 Shell、会话 identity、运行时和外部 Agent backend 分层。OpenNeko 补齐桌面生命周期、会话、权限、插件和后台任务时，不需要引入 Code OSS Workbench 或 VS Code Extension Host，也不能用 active Tab 模拟多实例。

## 已验证事实

| 项目 | Desktop 与 runtime | 扩展边界 | 许可 | 主要来源 |
| --- | --- | --- | --- | --- |
| OpenCode | `packages/desktop` 是 Electron 应用；main process 启动和监管本地 server/sidecar；server 将 project、session、status、child、fork 和 abort 暴露为独立资源，App 另行维护 window-scoped session/draft tabs | 内部包含 MCP、Skill、permission、plugin、ACP 和 server route；primary agent 是会话内可切换 profile/mode，subagent 可创建 child session | MIT | [Server](https://opencode.ai/docs/server/)、[Agents](https://opencode.ai/docs/agents/)、[Desktop main](https://github.com/anomalyco/opencode/blob/dev/packages/desktop/src/main/index.ts)、[App tabs](https://github.com/anomalyco/opencode/blob/dev/packages/app/src/context/tabs.tsx) |
| Zed | Project 下的 Thread 独立拥有 agent、context 和 conversation history；Threads Sidebar 可同时投影多个项目和运行状态，Agent Panel 只显示当前选择的 Thread | 同一 Thread shell 可承载 Zed Agent、ACP External Agent 或 Terminal Thread；各 backend 保持自身 auth、model、tool 和配置边界 | 主要为 GPL-3.0-or-later，标记组件为 Apache-2.0 | [Agents](https://zed.dev/docs/ai/agents)、[Parallel Agents](https://zed.dev/docs/ai/parallel-agents)、[Agent Profiles](https://zed.dev/docs/ai/agent-profiles)、[Repository licensing](https://github.com/zed-industries/zed#licensing) |
| Craft Agents | Electron main/preload/React renderer；共享层拥有 agent、session、source、credential 和 status；可连接 headless server | Skill、MCP/REST/local source、权限模式、automation 和预览由其自有 transport/store 驱动 | Apache-2.0 | [README 与 Architecture](https://github.com/craft-ai-agents/craft-agents-oss)、[Electron package](https://github.com/craft-ai-agents/craft-agents-oss/blob/main/apps/electron/package.json) |
| Goose | Electron/React Desktop 启动打包的 Rust `goose` CLI，并连接其 ACP server；ACP 用 `session/new`、`session/load`、`session/prompt` 和 `session/cancel` 管理 backend session | Rust runtime 拥有 provider、MCP extension、permission、session、recipe、schedule；Desktop 通过 ACP adapter 投影 | Apache-2.0 | [Desktop README](https://github.com/aaif-goose/goose/blob/main/ui/desktop/README.md)、[Custom UI / ACP](https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md) |
| Kun | Electron Renderer 经 preload/main 连接唯一 `kun serve` HTTP/SSE runtime；Code、Design、Write 与手机连接共享 runtime、thread、approval、tool 和 event | `.kunx` 可贡献工作台 UI、独立 Node Extension Host、Agent/tool/provider/account；MCP、Skill 与 UI 外观包保持独立机制；project MCP approval 绑定 workspace 与规范化配置 digest | PolyForm Noncommercial 1.0.0；商业集成需单独授权 | [README](https://github.com/KunAgent/Kun)、[单运行时架构](https://github.com/KunAgent/Kun/blob/master/docs/kun-architecture.md)、[Extension v1](https://github.com/KunAgent/Kun/blob/master/docs/extensions/README.md)、[Project MCP/Skill trust](https://github.com/KunAgent/Kun/blob/master/docs/project-mcp-skills.md) |
| Cindy | Electron Desktop + Expo/React Native Mobile + shared packages；客户端可承载 Claude Code、Codex 等 harness，并保持 workspace、memory、Skill 和 tool 连续；backend service 不在该仓库 | `.cindy` 插件使用独立 Electron sandbox process/session partition 和 capability slot；另有中立 browser-control runtime、MCP、device-link allowlist 与 remote-file service | 客户端 Apache-2.0；独立 backend 不在同一开源仓库 | [README](https://github.com/makecindy/cindy)、[产品原则](https://github.com/makecindy/cindy/blob/main/docs/product-rules/core-product-principles.md)、[布局架构不变量](https://github.com/makecindy/cindy/blob/main/docs/dev-rules/architecture-invariants.md)、[Electron 进程边界](https://github.com/makecindy/cindy/blob/main/docs/dev-rules/electron-security-and-process-boundaries.md)、[插件安全](https://github.com/makecindy/cindy/blob/main/docs/dev-rules/plugin-security-and-authoring.md)、[Browser control runtime](https://github.com/makecindy/cindy/tree/main/packages/browser-control-runtime)、[远程/移动边界](https://github.com/makecindy/cindy/blob/main/docs/dev-rules/remote-and-mobile-adaptation.md) |

Electron 只提供 Chromium、Node、窗口和原生桌面能力。OpenCode、Craft Agents、Goose、Kun 和 Cindy 使用 Electron 不等于复用 VS Code；其仓库没有把 Code OSS Workbench、Editor Group 或 VS Code Extension Host 作为 Desktop 产品骨架。Zed 的价值在于 Thread/backend 分层，不构成采用其编辑器工作台或代码的建议。

## Kun、Cindy 与 OpenNeko 横向对比

| 维度 | Kun | Cindy | OpenNeko 目标 |
| --- | --- | --- | --- |
| 产品中心 | 需求 → Design → Plan → Code/Write → Review | 通用真实工作、多 harness、多端与插件连接 | 内容创作、角色 IP、互动世界与专业制作 handoff |
| Agent authority | 单一 `kun serve` runtime；一个产品 Agent 表面 | 多 harness/model 可切换，客户端维持任务连续性 | Pi/`neko-agent` 保持唯一 canonical Agent path；未来 backend adapter 需独立变更 |
| UI/runtime 边界 | Renderer → preload/main → 本地 HTTP/SSE runtime | Renderer 不可信，Main/受控进程拥有特权；Desktop/Mobile 共享 packages | renderer → typed Desktop bridge → Host/domain service；领域事实不进入 Agent/UI |
| 扩展 | `.kunx` Extension Host/Webview/Broker，另有 MCP、Skill、外观包 | `.cindy` 独立 Electron sandbox + capability slot；结构化 Agent↔Plugin 交互 | 先用受控 contribution slot、MCP、Skill、专业工具 profile；不开放任意 Shell/DOM |
| Computer Use | 公开架构文档未给出专业应用 window/document/evidence contract | 官网声明可控制 computer/phone；公开仓库可验证 browser runtime、device-link 和插件沙箱，但未找到完整专业桌面 target-binding contract | MCP/API 优先；Computer Use 是显式 transport，绑定 app/process/window/document，支持 takeover 和分级结果证据 |
| 多端/跨平台 | macOS Intel/ARM、Windows x64、Linux x64；手机连接复用 runtime | Desktop + Mobile + device-link/SSH remote；客户端公开下载覆盖多平台 | 当前发布闭集仍为 `darwin-arm64`、`linux-x64`；Windows、Mobile、remote control 分别准入 |
| 最值得借鉴 | 单 runtime、协议化 GUI、project MCP digest trust、稳定 Extension API | harness continuity、结构化插件 UI、进程/partition 隔离、device allowlist | 吸收基础设施模式，但由 Content/Chara/World/Professional Tool owner 限定产品语义 |

Kun 与 Cindy 都比 OpenCode/Craft 更接近“完整桌面 Agent 产品”，但仍不能直接成为
OpenNeko Desktop 模板。Kun 的 Code/Design/Write 是软件生产 surface；Cindy 的 Core
强调连接任意真实工作。OpenNeko 必须继续用 Content、Character、World 三类 Project
Profile 和领域持久事实约束 Agent，不能把所有内容放进通用 workspace/thread/plugin。

## 会话、运行时与 UI identity 对比

| 客户端 | 持久会话对象 | UI 选择/多开对象 | Agent 配置对象 | 子 Agent | 关闭 UI 的语义 |
| --- | --- | --- | --- | --- | --- |
| OpenCode | Server `Session` | window-scoped `SessionTab` / `DraftTab`；Session 内另有文件/结果 tab | primary agent / permission profile | child session，可从 parent/child 导航 | 关闭 session tab 只移除窗口投影；abort 与 delete 是独立 server operation |
| Zed | Project-scoped Thread | Threads Sidebar item + 当前 Agent Panel；可跨项目并行 | Zed Agent profile 或 External/Terminal backend 类型 | 独立 Thread 或 backend 内部 delegation | 切换 Thread 只改变 Panel 投影；运行 Thread 继续工作，archive/delete 是独立动作 |
| Craft Agents | Workspace-scoped Session | Inbox item、Panel Stack、focused window | agent/provider/permission mode | 由 runtime/session workflow 表达 | 关闭 panel/window 不应等价删除 session；workspace runtime 继续拥有状态 |
| Goose | ACP/REST Session | Desktop 当前会话与历史投影 | Goose backend provider/extension/recipe | backend 内 subagent/recipe | UI 与 backend process/session 通过 ACP 分离，cancel 只针对进行中的 prompt |
| Kun | `kun serve` Thread/Session | Code/Design/Write workspace、当前 thread 与 side panel | 单 `kun` Agent、surface-scoped profile/provider | child run；`delegate_task` 是唯一入口 | Renderer 关闭/切换只改变 HTTP/SSE projection；runtime thread 仍由 serve 拥有 |
| Cindy | task/session + harness binding | Desktop panel/layout、Mobile/IM/device projection | harness × model × Skill/tool policy | Orca/多 Agent workflow | 不同端继续同一任务；执行与控制端通过 device-link/服务边界分离 |

这些名称不能直接映射为 OpenNeko 同名对象。特别是 OpenCode 文档中的 `Tab` 键切换的是 primary agent，不是 UI Tab；其 App `SessionTab` 才是窗口投影。Zed 的 Thread 同时接近 OpenNeko Conversation 和 runtime binding，但仍不拥有项目事实、导出任务或 Character/World run。

## 前端 UI 状态与竞态管理对比

开源 GUI Agent 大致形成三种组合方式：

1. 本地 runtime/server + 薄 GUI：OpenCode、Kun、Goose。GUI 管窗口、输入和投影，
   server/runtime 管 session、run、tool 和取消。
2. 产品 Host + 多视图/多端投影：Craft Agents、Cindy。Host 管任务、持久化、权限和插件，
   Desktop/Mobile/Panel 只是不同控制面。
3. 编辑器内 Thread + backend adapter：Zed。Project/Thread 是产品对象，内置 Agent、
   ACP 和 Terminal backend 通过统一 shell 投影，但保留各自运行边界。

真正有价值的不是“都使用 React/Zustand”，而是 state authority、持久化位置和事件协议：

| 参考 | 可验证的竞态防护 | 未能从公开资料验证的部分 |
| --- | --- | --- |
| Kun | Renderer 通过 preload/main 连接单一 `kun serve`；SSE 使用 `threadId + sinceSeq`；runtime 采用 append-only log，批量并发只读 Tool 后仍按 call 顺序写回结果 | 架构文档没有完整定义 Zustand store scope、snapshot/subscribe 原子边界、CAS、跨窗口 attachment 或迟到 UI response 规则 |
| Cindy | Renderer 不保存长期业务真值；Main/领域 package 持久化；布局树由 shared schema + Main `LayoutStore` 唯一拥有，`panelKind` 是身份，首帧同步恢复避免默认布局闪跳 | 公开规则未给出所有 task/session/device event 的统一 sequence、base revision、snapshot recovery 或多端冲突协议；不能从“多端连续”推断已经解决全部竞态 |
| OpenCode | server Session 与 window Tab 分离；session status/abort/delete 是显式资源和 operation | App 内部 store 可以参考高频 session UX，但不能直接作为 OpenNeko Project/领域 Job authority |
| Craft Agents | main/preload/renderer 分层，多会话 Inbox/Panel Stack 把执行和当前焦点分开 | 其 transport/store/credential/session schema 是产品私有组合，不构成 OpenNeko 事件顺序 contract |
| Codex | 开源仓库可验证 CLI/runtime 能力和任务语义 | Codex Desktop GUI 并未作为该仓库的开源 Renderer 实现提供，不能据此声称其 Tab/store/竞态方案可复制 |

对 OpenNeko 当前代码的审计表明，Agent Webview 已有比上述产品介绍更具体的可复用原型：

- `ProjectionAttachmentKey` 绑定 endpoint epoch、attachment、Tab 和 Conversation；
- snapshot 必须先安装并 acknowledgement，之后 patch sequence 必须连续；
- patch 校验 `baseProjectionVersion`，Conversation replica 再校验 owner、turn/run/message、
  item identity 与单调 revision；
- endpoint replacement、旧 attachment frame 和 protocol fatal 有明确拒绝/重附着语义；
- `TabRenderRuntime` 按 Tab/Conversation 创建 store，使用 `useSyncExternalStore` 订阅，并只
  持久化草稿、模型选择等 view state；
- Tab mutation 已使用 expected revision 和 activation id，但旧的 active conversation
  projection hook/handler 仍说明未来 Desktop 不能复制“active ref + 多套局部 state”作为
  canonical store。

因此，最合理的 Desktop 方案不是采用竞品某个 store，而是把现有 Agent attachment 模式
提取为 host-neutral primitive，并明确区分：

1. Host/domain authoritative snapshot；
2. Renderer 中按 owner identity 建立的 immutable replica；
3. `WindowId` scoped Tab/layout state；
4. `ViewId` scoped draft/scroll/selection state；
5. component-local ephemeral state；
6. sandboxed plugin-private state。

每个 owner stream 独立有序，不建立全局 event sequence。跨项目 badge/Activity 由 Host
生成单独摘要 projection；异步 command 捕获准确 owner/view epoch 并携带 command id 与
expected revision。这样才能处理快速切 Tab、跨窗口多 view、snapshot/subscribe 空窗、
autosave 回写覆盖新输入、关闭 view 后迟到响应、Computer Use takeover 和插件卸载后的
旧消息，而不是依赖 React render 顺序或 Zustand 最后一次 `set`。

## 可复用内容

### OpenCode：宿主与高频会话实现参考

适合参考：

- sidecar spawn、readiness、health、stop、relaunch 和异常退出语义；
- loopback server、代理绕过、深链、窗口恢复和应用退出清理；
- terminal transport、session timeline 增量投影和大量消息虚拟化；
- server/project/session identity 隔离及其回归测试结构。
- session、window tab、session-internal file/result tab 的分层；
- list/status/children/fork/abort/delete 的独立生命周期 operation；
- 同一 server/session 在一个窗口内去重，关闭 Tab 只 detach UI 投影。

OpenCode 的关键运行链是：

```text
Desktop / Web / TUI client
  -> OpenCode server
     -> Project
        -> Session
           -> message / status / permission / child / current run

Window
  -> SessionTab(sessionId) | DraftTab(draftId)
     -> session-internal file / diff / result tabs
```

其优点是 server session 不依赖可见 UI，多个 session 可以分别处于 busy/idle/error；其局限是 project 主要围绕目录/VCS，session 和 child session 主要围绕 coding task。OpenNeko 不能据此把 workspace path 当成 Project identity，也不能把内部 subagent child 自动提升为用户顶层会话或 Project Tab。

不直接采用：

- OpenCode server、session store、provider/plugin runtime；
- SolidJS 产品 UI 和 `@opencode-ai/*` 内部包；
- 用 OpenCode contract 取代 Neko Agent、Host、Proto 或项目事实。

### Zed：Project/Thread/backend adapter 参考

适合参考：

- Thread 按 Project 分组，但单个 Shell 可以同时观察多个 Project；
- 每个 Thread 独立拥有 agent、context、history 和运行状态，选择 Thread 只切换 Agent Panel；
- 内置 Agent、ACP External Agent 和 Terminal CLI 共享 Thread shell，但保留各自 backend 配置和能力边界；
- archive、history、restore、delete 与运行状态分离；
- 多个并行 Thread 涉及同一仓库时，可通过 worktree 隔离写入环境。

Zed 最接近 OpenNeko 未来的 `Conversation -> AgentBackendBinding`：一个产品级
Conversation/Thread shell 可以选择不同 backend adapter，但 backend 不拥有 Project、
Character、World 或 owning-domain Job/Run 控制面。OpenNeko MVP 仍以 Pi adapter 为唯一
canonical path；引入 ACP 或 Terminal backend 必须经过独立 OpenSpec，不能因 UI 可统一
展示就建立多套内部 Agent runtime。

不直接采用：

- Zed editor、worktree 或 code-review 工作流作为 OpenNeko Desktop 骨架；
- 把 Thread 类型当作 Project Profile；
- 把 Agent profile、External Agent backend 或 terminal process 当作 Conversation identity。

### Craft Agents：Home 与项目 Agent UX 参考

适合参考：

- 多会话 Inbox、状态过滤、搜索、flag 和 needs-review 流程；
- workspace/source onboarding 与 source 健康状态；
- Explore、Ask to Edit、Auto 等渐进权限；
- 后台 session/task、结果文件、变更、预览和交付物检查；
- Electron main/preload/renderer 的窄桥与安全分层。

Craft 的核心价值是 attention management，而不是浏览器式 Tab：Inbox、Panel Stack、focused window 和 needs-review 状态可以同时投影同一 workspace 下的多个 session。OpenNeko 可采用这种“工作等待用户，而不是强制抢占当前页面”的交互，但 Session 不能成为项目、任务或领域运行的统一容器。

React/Tailwind 技术栈与 OpenNeko 接近，但其页面组件普遍依赖自有 transport、store、credential 和 session schema。优先按 OpenNeko contract 重建交互；只有职责独立、依赖闭合的 utility 或 primitive 才进入逐文件复用审计。

不直接采用：

- Claude Agent SDK 与 Pi 双 runtime；
- JSON/JSONL session、credential、source 和 remote server 事实；
- 文档转换、内容读取或预览的平行实现；这些能力继续由 `@neko/content`、Host IO 和领域 owner 提供。

### Kun：单 runtime、需求链与 Extension Host 参考

适合参考：

- Renderer 不嵌 Agent loop，只把本地 `kun serve` 当成稳定 HTTP/SSE protocol；
- Code、Design、Write 共享线程、审批、工具和事件，但 surface-scoped profile/tool
  policy 仍显式进入 run；
- `.kunx` 只通过公开 SDK、Manifest Schema 和能力 Broker 工作，不能获得内部
  AgentLoop、runtime token 或任意 Electron IPC；
- Node Extension Host、Webview 与普通 MCP/Skill/外观包分开，权限和生命周期可独立审计；
- project-owned MCP config 不能自授信，用户 approval 绑定 workspace 和规范化配置
  digest，配置语义变化后授权失效。

OpenNeko 可借鉴 protocolized local runtime 与 MCP digest trust，但不新增 `neko serve`
或恢复第二个 Agent backend。现有 Pi/Agent、Desktop Host adapter 和领域 service 已经
定义 canonical path；只有真实跨进程/多客户端需求证明后，才把其中一段提升为 loopback
protocol。

不直接采用：

- Code/Design/Write 作为 OpenNeko 顶级 Project Profile；
- 可注入工作台页面、Direct DOM 或以当前用户权限执行 Node 的宽 Extension 模型；
- Kun runtime、`.kunsdd`、`.kunx` 或 project/session 数据格式；
- 其非商业许可代码。任何商业产品代码复用都需另行取得授权。

### Cindy：多 harness 连续性、插件沙箱与多端控制参考

适合参考：

- 产品任务、workspace、memory、Skill 和 tools 不应因 harness/model 切换而丢失；
- Desktop 与 Mobile 不是复制页面，而是分别承担执行、查看、输入、approval 和接管；
- 插件使用独立 Electron sandbox process 和专属 session partition，通过 capability
  slot、最小 context bridge 与结构化数据/事件同 Agent 协作；
- device-link 的 invoke/push allowlist，以及 SSH workdir 通过 remote-file service
  访问而不是误读本机路径；
- browser automation 抽成 host-neutral runtime，由 Desktop Host 与 MCP adapter 复用，
  不把上游产品 API 泄漏给 product code。

OpenNeko 可采用插件进程/partition 隔离与“控制端不拥有执行事实”的原则。多 harness
切换、Mobile、IM、remote control 和 scheduler 不进入 Desktop MVP；引入时必须保证
Pi canonical path、项目事实、Tool Call/Job identity 和 approval 不因端或 harness 改变。

不直接采用：

- 把 Claude Code、Codex 和未来 harness 同时作为 OpenNeko 内部主 Agent；
- 用通用 task/workspace/plugin container 取代 Content、Character、World owner；
- 依赖未开源 backend service 的 session、sync 或 team contract；
- 把 browser control、device-link 或官网的“控制 computer”承诺等同于已验证的专业
  应用 Computer Use target binding。

### Goose：ACP 与 MCP App 边界参考

适合参考或进行独立 spike：

- ACP capability negotiation、session、prompt、permission、elicitation 和 tool notification；
- Desktop client 与本地/外部 Agent backend 的进程隔离；
- MCP extension 生命周期与 MCP App 的受控 UI 投影；
- transport auth、取消、诊断和 session identity 测试。

ACP 若进入 OpenNeko，只能作为可选外部 Agent adapter：

```text
Desktop / VS Code / TUI
  -> Neko AgentHostRuntimeAdapter
     -> Pi adapter（默认 canonical path）
     -> ACP adapter（未来、可选外部 backend）
```

ACP 不替换 Desktop typed IPC、`@neko/media` ports、仍有真实消费者的 Proto、
Neko Agent 内部 contract 或项目格式。Goose Rust Agent runtime 不进入媒体运行时；
Agent orchestration 与 Node/FFmpeg 媒体执行保持不同 owning responsibility。

Goose 的主要价值是证明 `session/new/load/prompt/cancel` 和流式 tool/permission event
可以由 backend protocol 提供。它不是完整的 OpenNeko 控制面：Project catalog、
Conversation view、CharacterRun、WorldRun/Save、ExportJob 等仍必须由 OpenNeko owning
service 管理。

## 对 OpenNeko identity 与生命周期的推导

稳定结论应收敛为以下对象，不使用一个 `sessionId` 或 `tabId` 承担所有职责：

```text
ProjectId
├─ ConversationId
│  ├─ ConversationRuntime            # host-owned, keyed by project/conversation
│  ├─ AgentProfile / CharacterProfile
│  └─ AgentRunId
│     └─ ChildAgentRun / DelegationRun
├─ GenerationJob / ExportJob         # owning-domain async work
├─ CharacterRun
├─ WorldRun / WorldSave
└─ SurfaceId                         # Canvas/Cut/Character/World/document

WindowId
└─ ProjectTabId -> ProjectId
   └─ ConversationViewId / SurfaceViewId -> owning identity
```

语义约束：

1. `ConversationRuntime` 按 `ConversationId` 建立，不按 UI Tab 建立；同一 Conversation 的多个 view 共享后台 runtime，但各自拥有滚动、选择和布局等 view state。
2. 同一 Conversation 在同一 Window 默认去重；跨 Window 可以有多个 view，不能因此复制 runtime、消息队列或工具执行。
3. 关闭/detach view 不 abort 当前 run、不删除 Conversation；abort、archive 和 delete 是显式独立 operation。
4. `AgentRunId` 表示一次 turn/续跑/delegation 的执行，Agent profile/角色只决定上下文、模型、能力和策略，不成为 runtime identity。
5. Subagent 默认是父 Conversation 下的 child/delegation run；只有用户显式打开、需要独立长期讨论或 needs-review 时，才提升为独立 Conversation/view。
6. 导出、渲染、导入和领域异步工作使用 Generation、Cut、Assets、Chara、World 等 owner
   的具体 Job/Run identity，可以由 Agent 发起，但不冒充 Conversation 或 child Agent
   session，也不再抽象为通用 `BackgroundWorkId`。
7. operation/event 必须携带显式 project/conversation/run/work identity；缺失或不匹配时 fail-visible，不回退当前 active Tab/Thread。

## 对最终 UX 的映射

| OpenNeko 表面 | 主要参考 | 采用内容 |
| --- | --- | --- |
| Home 入口与会话/任务 | Craft Agents、OpenCode、Zed | Director composer、多会话 Inbox、按项目分组、独立状态和后台任务投影 |
| Content Project | MiniMax Hub、OpenCode、Kun | 左资源、中创作表面、右 Agent/Review/Tasks；需求/计划/验收可连续，但终端或 Diff 只按需出现 |
| Character IP Project | Craft Agents、Zed | 多 Conversation 实验、结果审阅、独立 profile/backend binding 和权限反馈；角色事实与运行由 Neko 新领域拥有 |
| Interactive World Project | Goose 的 backend 隔离模式 | authoring 与 run/save 分离；外部 Agent 只能通过显式 adapter 参与 |
| Skills、插件与受控面板 | Craft Agents、Goose、Zed、Kun、Cindy | Skill/Source/MCP catalog、profile/tool availability、受控贡献、独立沙箱、诊断、permission、MCP App 候选 |
| Computer Use live session | Cindy 的多端接管产品原则；Kun 的统一 approval/runtime | Tool Call 投影、明确 target、Pause/Stop/Take over；不采用未验证通用桌面控制实现 |
| Desktop Host | OpenCode、Craft Agents、Kun、Cindy | Electron 生命周期、sidecar/runtime、typed preload bridge、进程/partition 隔离、深链和更新 |

这些参考不会增加第四种 Project Profile，也不会让会话、插件或 Canvas 成为角色和世界的事实 owner。

## 许可与不确定性

- OpenCode 为 MIT；Craft Agents、Goose 和 Cindy 客户端为 Apache-2.0；Zed 主要为 GPL-3.0-or-later，部分标记组件为 Apache-2.0；Kun 为 PolyForm Noncommercial 1.0.0，商业使用/集成需要单独授权。OpenNeko 为 AGPL-3.0-or-later，选择性纳入代码前仍需逐文件确认版权、LICENSE、NOTICE、专利条款和第三方依赖。本文对 Zed、Kun 只作产品/协议边界参考，不授权复制代码。
- OpenCode、Zed、Craft Agents、Goose 的事实核对日期为 2026-07-22；Kun、Cindy 的公开仓库与官网核对日期为 2026-07-27。目录、依赖和能力可能变化；实施 spike 必须固定 commit 并重新审计。
- Cindy 开源仓库是客户端，backend service 在独立仓库且不属于该客户端 monorepo；官网能力声明不能替代 backend、Computer Use 或远程控制的可审计实现 contract。
- “适合参考”不代表已经通过 OpenNeko 的安全、可维护性、性能或运行态验收。
