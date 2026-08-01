# ADR: Neko Desktop 专业工具 Handoff、MCP 与 Computer Use 边界

状态：Proposed

日期：2026-07-27

范围：拟议中的 `apps/neko-desktop`、Agent、MCP、Computer Use、
Plugin/Capability、External
Processor、Content/Character/World Profile、Canvas、Cut、Preview、Assets，以及
DaVinci Resolve、剪映/CapCut、Photoshop、Live2D Cubism、Blender、Unity、
ComfyUI 等外部专业工具。

## 定位

OpenNeko Desktop 是 **AI 原生轻量创作工具与专业制作软件之间的编排中枢**，不是
重新实现一套 NLE、Photoshop、DCC、Live2D 编辑器、游戏引擎或 ComfyUI。

内置子包负责：

- Agent 驱动的分析、规划、生成与工具编排；
- 素材管理、候选、实体和 provenance；
- Canvas/Board 的快速组织与可视化；
- Cut 的 OTIO 轻量剪辑、预览和交付准备；
- 图片、视频、音频、文档、角色和世界的快速预览、轻编辑、审阅和验证；
- 把结果导出为专业软件能够接收的稳定素材或交换 bundle。

外部专业工具负责：

- 完整剪辑、调色、合成、声音后期；
- 分层图像和高精度绘制；
- Live2D 资产制作、绑定与动画；
- 完整 3D 建模、材质、绑定、动画、渲染；
- Unity 等游戏/互动工程 authoring、调试和构建；
- ComfyUI 等复杂节点 workflow、模型与队列执行。

产品完成事实必须诚实：OpenNeko 内置 surface 只证明轻量结果；需要专业环节时，
“已导出并成功交给专业工具”才是 handoff 完成，不是最终专业制作完成。

## 五层分析

| 层   | 决策                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 职责 | 领域 owner 冻结 revision 和导出；Professional Tool service 发现/启动/绑定外部 session；Agent Tool Call 编排操作；MCP Manager 连接 MCP；Desktop Host 执行授权窗口观察和输入；外部应用拥有 native document。               |
| 依赖 | renderer 只调用 typed Desktop bridge；Agent 只消费 capability/tool catalog；adapter 通过 Host 授权解析 app、path、credential、window；领域包不依赖第三方 SDK 或 OS 输入 API。                                            |
| 接口 | integration contribution 分 launch、exchange、automation facet；automation 声明 transport、target binding、action traits 和 verification；handoff 携带 app、revision、resource、profile、session、result 和 provenance。 |
| 扩展 | 新工具通过 builtin/plugin integration contribution 接入；不新增 Shell、MCP runtime、Computer Use loop、processor registry、Agent loop 或通用 TaskManager。                                                               |
| 测试 | 隔离 fixture 加真实安装应用，验证发现、启动、导出、明确 target、MCP/Computer Use 操作、用户接管、修改证据、取消、round-trip 与不可用诊断。                                                                               |

## 决策

### 1. 创作能力分为内置轻量层与外部专业层

| 能力层                          | Canonical owner                                                 | 用户价值                                           | 明确不负责                               |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| AI-native lightweight authoring | Agent、Canvas、Cut、Preview、Assets、Chara/World 轻量 surface   | 快速生成、组织、预览、轻编辑、审阅、验证和导出准备 | 完整 NLE/DCC/图像编辑/引擎/workflow 功能 |
| Professional production         | 用户安装的专业软件                                              | 专业编辑、精修、资产制作、工程 authoring、最终制作 | Neko 项目、Agent transcript 或媒体库事实 |
| Integration orchestration       | Desktop Host + owning domain + Agent Tool Call/MCP/Computer Use | 发现、导出、打开、自动化、结果回收和 provenance    | 第三方 native document 的内部语义        |

新需求优先判断应增强轻量闭环，还是应进入专业 handoff。只有高频、跨工具、能保持
轻量边界的能力才进入内置子包；专业软件已经拥有且会持续演进的复杂 authoring 不在
Neko 内复制。

### 2. 一个专业工具 integration 同时声明三类 facet

`ProfessionalToolIntegration` 是 Desktop Host 中版本化、机器可读的 contribution，
由 builtin 或 plugin 提供，并归一化到同一 catalog。它拥有稳定 `integrationId` 和：

| Facet      | 职责                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch     | 支持平台、应用 identity、版本范围、安装/配置状态、安全启动参数和 lifecycle                                                                      |
| Exchange   | 接受/产生的 media type、交换 profile、导出 adapter、semantic loss、relink/round-trip                                                            |
| Automation | vendor MCP、可信第三方 MCP、Neko API adapter 或受控 Computer Use，及 operation risk/permission/host requirement、target binding 和 verification |

Manifest 不自证安装、版本兼容或 trust。Host 必须通过 tool-specific adapter 发现用户
显式配置或系统安装，不能扫描任意 PATH 后把同名 executable 当作成功。

每个 integration 按已验证能力声明等级：

| 等级               | 能力                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `launch-only`      | 打开应用，不带项目或资源                                                                              |
| `export-and-open`  | 产生 durable exchange bundle 并在目标应用打开                                                         |
| `read-automation`  | 通过 MCP/API 或 qualified Computer Use 查询明确应用、项目、文档、selection、queue 或状态              |
| `write-automation` | 通过 MCP/API 或 qualified Computer Use 对明确目标执行编辑、生成、导入、渲染或构建，并提供独立结果证据 |
| `round-trip`       | 验证外部结果并显式导回 Neko 新 revision/candidate                                                     |

Capability level 之外还必须声明：

- `automationTransport`：`mcp`、`api`、`computer-use` 或其显式组合；
- `verificationLevel`：authoritative API state、durable artifact、qualified semantic UI
  或 visual-only；
- 精确 platform、app version、UI profile、语言/布局约束和所需 Host capability。

没有稳定 API/MCP 的工具可以先支持 `launch-only`、`export-and-open`，或在满足目标绑定、
操作限制和结果证据时声明 qualified Computer Use。仅依赖窗口标题、固定像素坐标、
截图看似正确或逆向私有工程格式的能力只能算 assisted/needs-review，不得冒充已验证
`write-automation`。

### 3. UI “Open in…” 与 Agent automation 复用同一 application service

调用关系为：

```text
Project UI / Media Library
  -> typed Desktop bridge
  -> ProfessionalToolApplicationService
     -> owning-domain export adapter
     -> ProfessionalToolHostPort
     -> launch / bind external session

Agent Tool Call
  -> existing permission / approval / cancellation / transcript
  -> Professional Tool automation router
     -> existing MCP Manager -> vendor MCP / Neko MCP adapter
     -> Neko API adapter
     -> Desktop Host Computer Use port
  -> same ProfessionalToolApplicationService
  -> same export / launch / permission / session path
```

UI 不经 Agent 或 MCP 绕行；用户点击 “Open in Photoshop” 不应创建隐藏 Conversation
或伪造 Agent Tool Call。Agent 则必须通过现有 MCP Manager、Tool Call、permission、
approval 和 transcript projection 调用同一 service。Computer Use 也只是这个 Tool Call
中的一种 automation transport，不能创建平行的 GUI Agent loop。不同入口不能各自实现
路径解析、应用启动或导出。

现有 `HostExternalPort.openExternal()` 可作为 Host 内部受控原语，但不能直接成为公开
专业工具 contract：它缺少 target app、source revision、exchange profile、external
session、结果和 provenance。现有 `NekoApplicationHandoffPort` 只用于 Neko application
instance，也不扩展为第三方应用协议。

### 4. Handoff 是显式事务，不是“把当前文件路径丢给应用”

`ProfessionalHandoff` 至少表达：

- handoff/request identity；
- target `integrationId` 与已验证 app version/platform；
- owning project/document/resource identity 与 frozen revision；
- user intent：open、continue-edit、render、build、generate、round-trip；
- exchange profile 与预计 semantic loss；
- 输入 `ContentLocator`、导出 bundle 与 provenance；
- approval、external session/document binding、结果和 diagnostic。

流程固定为：

```text
explicit source + revision
  -> validate integration and exchange profile
  -> owning domain freezes revision
  -> export durable bundle
  -> launch target app with explicit argv/URI contract
  -> bind external session/document when automation exists
  -> observe or automate through explicit MCP / API / Computer Use transport
  -> import/relink/review external result
  -> create new Neko candidate/revision/output
```

不能把 Webview URL、custom-protocol token、Blob、`ProcessorOutputLocator`、Host cache
path 或系统 temp 作为 durable handoff。未 promoted processor output 必须先由 owning
writer 接收为 `ContentLocator`。

启动专业工具是外部副作用：必须显示目标应用、将要导出的内容、目标位置、格式损失和
权限。使用 argv 数组或受控 platform API，不拼接 shell command。Desktop 只负责启动
和 handoff receipt；除非 integration 明确拥有 sidecar/process lifecycle，关闭 Neko
不得强制结束用户的专业应用。

### 5. 每类专业工具由 owning domain 选择交换语义

下表定义目标落点，不承诺尚未验证的具体私有格式：

| 工具类别 | 目标工具                     | Neko owner                 | 最低 handoff                                                                    | Automation 方向                                                     |
| -------- | ---------------------------- | -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| NLE/后期 | DaVinci Resolve、剪映/CapCut | Cut + Assets               | frozen OTIO revision、媒体 bundle、经验证的 timeline/video exchange profile     | timeline/project query、import、render/export；只使用已验证 API/MCP |
| 分层图像 | Photoshop                    | Assets/Canvas/Generation   | durable image/layer-capable export profile 与 reference bundle                  | document/layer query、controlled edit/export                        |
| 2D 角色  | Live2D Cubism                | Chara + Assets             | confirmed Character representation input、texture/source bundle                 | model/project query、import/build/export；不可用时只 open           |
| 3D/DCC   | Blender                      | Assets/Preview/Chara/World | model/scene/reference bundle 与 coordinate/unit diagnostic                      | object/scene query、import、render、bake/export                     |
| 互动工程 | Unity                        | World + Assets/Chara       | versioned asset/world handoff bundle，不直接写用户工程未知目录                  | project/scene query、asset import、build/test                       |
| 节点生成 | ComfyUI                      | Generation + Assets        | workflow/input binding、model dependency diagnostic、candidate output ownership | queue/status/cancel、workflow run、output ingest                    |

具体交换格式必须由 owning adapter 维护 profile 和损失说明。例如 Cut 已以 OTIO 为
内部事实，但 DaVinci/剪映 adapter 只能导出目标版本真实支持的交换格式；不得因为
内部有 OTIO 就宣称目标应用完整保留所有 timeline 语义。

ComfyUI 可以同时拥有：

- 打开本地 UI 的 Launch facet；
- 通过已验证 HTTP/MCP adapter 运行 workflow 的 Automation facet；
- 复用 External Processor output ownership 或 Generation-owned Job 的异步输出。

ComfyUI workflow JSON、queue 或 server state 不是 Canvas graph、Neko Project 或
Agent Task 事实。

### 6. 专业 GUI 应用与 External Processor 是不同运行边界

| 边界     | Professional Tool                        | External Processor                             |
| -------- | ---------------------------------------- | ---------------------------------------------- |
| 生命周期 | 长期交互应用、外部 document/session      | 单次或有界 headless invocation                 |
| 输入     | durable handoff bundle                   | Host 授权 input locator                        |
| 输出     | 外部 document/result，经 round-trip 接收 | Host-owned intermediate/debug/candidate output |
| 控制     | launch、exchange、MCP/API/Computer Use   | 固定 executable + argv                         |
| 用户交互 | 允许并预期                               | 不作为执行成功条件                             |

同一产品可同时贡献两种能力，但必须是两个明确 operation。例如 Blender GUI 编辑使用
Professional Tool handoff；固定 headless render 可以使用 External Processor。不得把
长时间运行 GUI 塞入 processor runner，也不得让 GUI 自己选择 processor output path。

### 7. 自动化必须绑定明确外部实例

专业工具 automation 复用 `neko-agent` 的唯一 Tool Call、permission、approval、取消和
transcript canonical path，不新增 `ProfessionalMCPManager` 或 `ComputerUseAgent`。
Integration plugin 可以：

1. 声明并连接经过验证的 vendor MCP server；
2. 连接用户安装并明确 trust 的第三方 MCP server；
3. 提供 Neko MCP adapter，把稳定官方 API/SDK/CLI 投影成 typed MCP tools。
4. 对没有稳定 API 的可见 UI 缺口，贡献受控 Computer Use profile。

无论 transport 是 MCP、API 还是 Computer Use，每个 stateful operation 必须携带明确
`integrationId`、handoff identity、
external session/project/document identity 和 expected revision（外部 API 能提供时）。
禁止使用“当前 active app/document/project/selection”作为未验证目标。

如果第三方 API 只能操作 active document，adapter 必须：

1. 在 handoff 时记录预期 native document identity/path；
2. 操作前读取 active document 并比较；
3. 不匹配或无法读取时要求用户切换并再次确认，或直接拒绝；
4. 操作后返回可验证的 revision、changed artifact、render result 或 diagnostic。

MCP 返回 success 文本、进程退出码、窗口获得焦点、输入已注入或 command 已发送都不是 mutation
成功证据。写操作结果必须报告目标 identity、实际修改/输出、provenance 和不可逆性。

#### 7.1 Computer Use 只操作显式授权的可见目标

Computer Use 的职责分离为：

| Owner                     | 职责                                                                          | 不拥有                         |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| Agent Tool Call           | 目标、计划、transport 选择、approval、取消、结果投影                          | OS 输入注入、窗口句柄          |
| Desktop Host              | Screen Recording/Accessibility/Input 权限、窗口枚举、受限截图、聚焦和输入原语 | 专业应用业务语义、完成判断     |
| Professional Tool adapter | app/process/window/document binding、允许动作、前置条件、验证规则             | Agent loop、Host 全局权限      |
| Plugin/Skill              | machine-readable integration/profile；Skill 描述专业方法                      | 任意坐标宏、工具协议、自动越权 |

每个 `ComputerUseSession` 必须显式绑定：

- owning Tool Call、`integrationId` 和 Desktop Host instance；
- 精确 application identity、process instance、window identity；
- handoff/external document/project identity（存在时）；
- 允许观察的 target window 或显式 region；
- 允许 action traits、approval policy、timeout、step budget 和 evidence policy。

Host 在每个会改变状态的 action 前重新验证 target binding。active application、focused
window、窗口标题或最近使用文档不能单独证明身份。窗口关闭、进程重启、UI profile
不匹配、焦点切换、目标遮挡或用户产生键鼠输入时，session 必须暂停；用户可以
`Pause`、`Stop`、`Take over`，恢复前重新绑定和确认待执行 action。不得在用户接管时
继续后台点击，也不得通过无限视觉重试掩盖失配。

默认允许的原语仅限集成 profile 明确需要的 click、type、shortcut、scroll、drag 和
wait-for-observation。文件选择器、覆盖/删除、发布、登录、安装、网络上传、运行脚本和
不可逆提交必须按 Tool traits 单独 approval；密码管理器、通知、其他应用、未授权屏幕、
完整系统剪贴板和秘密字段默认不可观察。需要输入文件或文本时，优先传递已授权
`ContentLocator`/受控 text value，而不是读取用户剪贴板。

#### 7.2 Computer Use 是显式 transport，不是错误 fallback

自动化优先级为：

1. 能精确寻址并返回结构化状态的 vendor API/MCP；
2. 由 Neko adapter 包装的稳定官方 API/SDK/CLI；
3. 仅用于可见 UI 缺口、已按 app/version/platform/UI profile 验证的 Computer Use；
4. 不满足上述条件时回到用户手动接管或 `export-and-open`。

这是 planner 的能力选择顺序，不是 runtime fallback 链。MCP/API 返回错误、schema
不匹配或 target 失配时必须先暴露 diagnostic；除非原计划明确包含 Computer Use 且已
满足其风险与 approval，不能静默改用键鼠继续。

Computer Use 采用有界的 observe → validate target → propose action → approve when
required → act → observe → verify 循环。完成证据按强到弱排序：

1. vendor API/MCP 返回的目标 revision、document state 或 queue/build/render result；
2. owning domain 可验证的 durable artifact、文件 identity/hash 或 round-trip input；
3. qualified Accessibility/semantic UI state；
4. 已裁剪和脱敏的 target-window screenshot。

截图、按钮消失、窗口焦点或视觉模型的自然语言判断不能单独证明专业修改、保存、导出、
发布或构建完成。只有视觉证据时，Tool Call 返回 `needs-review`/assisted result，并在 UI
展示目标窗口、最后动作和待用户核验项。原始 screenshot 默认是短生命周期 observation，
不得写入项目事实或长期 transcript；持久审计只保存必要的脱敏 evidence ref、hash、
action summary 和 diagnostic。

权限默认：

- discovery/status/query 可以标记 read-only，按 Plan Mode 和 MCP read policy 执行；
- launch、open、import、render、generate、build 属于外部副作用，至少需要明确 policy；
- 修改、覆盖、删除、发布、安装 plugin/package、执行脚本或网络上传需要对应 approval；
- cancel 只取消明确 Tool Call/Job/request；若外部工具已提交不可回滚变更，必须报告
  cancellation boundary，不能伪装为回滚成功；
- MCP server credential 使用 Host secret/provider adapter，不继承整个环境变量。
- Screen Recording、Accessibility/Input 等 OS 权限按 Host capability 单独请求和展示；
  缺失权限、headless session、锁屏或不受支持的窗口系统直接 unavailable。

### 8. Plugin 同时打包集成元数据、MCP 与专业方法，但职责不能混合

一个专业工具 plugin 可以包含：

- machine-readable Professional Tool integration contribution；
- MCP server/config/adapter；
- exchange adapter；
- optional machine-readable Computer Use profile，声明 app/window identity、semantic
  precondition、允许 action traits 和 verification；
- optional Skill，描述专业方法、判断、输出要求和审阅标准；
- optional Context Dock/diagnostic projection。

Skill content 不写具体 tool name、参数表、命令流程或 MCP 轮询协议；这些属于
integration catalog、tool schema 和 capability prompt。Computer Use profile 不得包含
任意坐标宏、隐藏循环或跨应用观察规则。Plugin 不能任意增加 Shell、
顶栏或 Home 一级入口，也不能因 manifest 声明而获得 `core` trust。

Home 的“Skills、插件与专业工具”管理面展示安装/配置、应用版本、capability level、
automation transport、MCP 连接、Computer Use 的 OS 权限/UI profile、依赖、trust、
权限和 diagnostics。项目与素材右键/命令面板提供
“Open in…”；高频工具可以出现在 Project Context Dock，但不为每个工具建立顶级 App。

运行中的 Computer Use 在 Conversation/Activity 投影 live session card：明确目标应用/
窗口、当前目标、最近 observation、下一动作、verification 状态，以及 Pause、Stop、
Take over。该卡片是 Tool Call 投影，不是独立任务或新会话。

### 9. Round-trip 是显式接收，不是目录监听后静默覆盖

外部应用修改的文件由外部应用拥有。返回 Neko 时，integration 必须执行明确的：

- validate：文件存在、类型、版本、依赖、hash、媒体/项目结构可读；
- compare：与 handoff source/revision 的关系和 semantic loss；
- ingest/relink：进入 owning domain 的 candidate 或新 revision；
- review：显示改变、冲突、缺失依赖和接受动作；
- provenance：记录 target tool/version、handoff、external document/result 和时间。

目录 watcher 只能产生“外部结果可能变化”的 attention，不得直接覆盖 Canvas、OTIO、
CharacterVersion、WorldVersion、媒体库 source 或 Agent transcript。接受外部结果必须
由 owning domain writer 原子提交。

## 当前成熟度

| 能力                                                                   | 当前状态                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| Pi/Agent 与 MCP Manager                                                | 已存在，可复用                                  |
| External Processor registry、path/env/output ownership                 | 已存在，可复用，但不负责 GUI app                |
| ContentLocator、Media Library、Cut OTIO/Export Job                     | 已存在，可作为 handoff 输入基础                 |
| Desktop Professional Tool catalog/Host port                            | 不存在，需要实施                                |
| Desktop Computer Use Host port/session/profile                         | 不存在，需要实施；不得显示可用                  |
| DaVinci、剪映、Photoshop、Live2D、Blender、Unity、ComfyUI integrations | 未实现，不能显示成功 capability                 |
| Professional round-trip                                                | 未实现，需要按 owning domain 和真实应用逐项验证 |

当前仓库没有 `apps/neko-desktop`。本文冻结目标边界，不授权创建空 integration、假 MCP
tool、未验证 exchange format 或成功 no-op。

## 实施顺序

1. 定义 Professional Tool contribution、catalog、Host port、handoff identity、
   capability level、diagnostic 和 typed Desktop IPC。
2. 实现 application discovery/config、launch-only、export-and-open 与隔离 fixture；
   先选择一个 NLE 和一个图像/DCC 工具完成纵向路径。
3. 把 Neko MCP adapter 接入现有 MCP Manager，验证明确 external session/document、
   read/write permission 和结果证据。
4. 定义 Computer Use Host port、session identity、窗口/文档 binding、action traits、
   takeover、privacy 和 evidence contract；选择一个无稳定 API 的工具先做 assisted
   纵向验证，不直接宣称 write-automation。
5. 为 Cut、Assets/Canvas、Chara、World、Generation 分别增加 exchange/round-trip
   adapter，不建立跨领域万能 exporter。
6. 逐工具、逐版本、逐平台扩大 capability level；无真实应用证据时保持 unavailable。

当前原生构建平台闭集是 `darwin-arm64` 与 `win32-x64`，Linux 只用于 host-neutral CI。
Integration 只声明目标软件真实支持且已经验证的平台；Windows package 不能替代逐工具
运行态准入。某工具不支持当前 OS 时返回
`unsupported-platform`，不能通过 Wine、远程 UI 或未验证兼容层返回成功。
Computer Use 还必须逐平台资格化 Screen Recording、Accessibility/Input、窗口枚举和
受限截图能力；平台可启动应用不等于具备 Computer Use。远程桌面、锁屏或 headless
session 不在当前发布闭集。

## 验证要求

- catalog：builtin/plugin source、version、platform、trust、enabled、capability level、
  automation transport、verification level、MCP/OS dependency 和 diagnostics；
- discovery：未安装、路径失效、版本不兼容、用户配置、多副本和应用升级；
- launch：argv/URI 注入、未授权路径、frozen revision、durable export、semantic loss、
  receipt、应用已运行/未运行；
- MCP：唯一 MCP Manager、server trust、tool traits、approval、明确 session/document、
  active-document mismatch、unknown tool/schema 和断线恢复；
- Computer Use：唯一 Tool Call path、精确 app/process/window/document binding、
  observation crop/redaction、action traits、step budget、用户输入检测、Pause/Stop/
  Take over、焦点/窗口/进程失配、OS 权限和不可用诊断；
- mutation evidence：读取目标、操作后 revision/changed artifact/output、不可回滚边界；
- visual evidence：仅截图保持 needs-review；用 API/MCP、durable artifact 或 qualified
  semantic UI 升级验证；敏感 observation 不进入长期 transcript/project；
- round-trip：外部改动检测、冲突、验证、candidate、新 revision、原子提交和 provenance；
- lifecycle：Neko 关闭不误杀用户 app、MCP/sidecar/adapter dispose、取消和 orphan
  diagnostic；
- security：renderer 无 Node/任意进程/任意路径；无 shell 拼接；MCP/adapter 不继承
  secrets；plugin 不能自升 trust；
- 真实应用：每个发布 capability level 必须在精确应用版本、OS/arch 和真实 fixture
  上验证；mock 只能证明 contract，不能证明集成可用。

Agent prompt、Skill、capability/tool routing、MCP connection 或 AgentSession 行为变化时，
还必须按 Agent evaluation skill 运行聚焦真实 evaluation；Desktop UI/IPC 则使用打包
Electron 与隔离 workspace 验收。

## 被拒绝的方案

- 在 Neko 内复制完整 DaVinci/Photoshop/Blender/Unity/ComfyUI：拒绝，偏离轻量
  AI-native 定位并形成不可维护的专业功能追赶。
- 所有工具都抽象成 External Processor：拒绝，GUI 应用、外部文档和交互 session
  与 headless 原子 invocation 生命周期不同。
- 让 UI 调 MCP 再启动应用：拒绝，UI 与 Agent 是不同调用者，应复用 application
  service 而不是伪造 Agent execution。
- 让 Agent 调任意 shell/URI：拒绝，绕过 integration catalog、路径、trust、approval
  和 provenance。
- 为 Computer Use 创建第二套 GUI Agent/任务 runtime：拒绝，必须复用现有 Tool Call、
  permission、approval、取消和 transcript。
- MCP/API 失败后静默切换键鼠自动化：拒绝，会把 contract failure 伪装成成功并改变
  风险边界；Computer Use 必须是显式选择的 transport。
- 插件提供固定像素坐标宏或观察整个桌面：拒绝，无法稳定绑定目标，也会泄露其他应用
  和敏感信息。
- 依赖 focused app/active document：拒绝，不能满足多实例和明确目标约束。
- 监听文件后自动覆盖 Neko 项目：拒绝，外部修改未经验证和审阅，可能损坏用户事实。
- 为每个工具创建 Home 一级入口或 Project Profile：拒绝，工具是 capability，不是项目
  事实或产品顶级领域。

## 参考

- [`adr-neko-desktop-composition-and-open-source-reference-boundary.md`](adr-neko-desktop-composition-and-open-source-reference-boundary.md)
- [`adr-neko-desktop-home-project-profile-ux-boundary.md`](adr-neko-desktop-home-project-profile-ux-boundary.md)
- [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)
- [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)
- [`adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md`](adr-cut-html-video-node-ffmpeg-media-runtime-boundary.md)
- [`asset-library.md`](asset-library.md)
- [`../../openspec/changes/define-desktop-professional-tool-handoff-mcp-boundary/`](../../openspec/changes/define-desktop-professional-tool-handoff-mcp-boundary/)
