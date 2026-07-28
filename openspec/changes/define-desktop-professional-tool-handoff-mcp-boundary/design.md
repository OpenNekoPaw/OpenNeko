## Context

仓库已有 Pi/Agent、唯一 MCP Manager、External Processor registry、
`ContentLocator`、Host path/trust policy、Cut OTIO/export 和领域 Job 生命周期。
这些能力分别解决 Agent 编排、MCP transport、非交互处理器、稳定资源、路径安全与
领域输出，但没有“安装的专业 GUI 应用 + 文件交换 + 外部文档/session + MCP 操作”的
统一边界，也没有把屏幕观察、窗口绑定、输入注入、用户接管和视觉结果验证纳入受控
Computer Use session。

`HostExternalPort.openExternal()` 只适合底层受控 URI 打开，不携带专业 app identity、
输入 revision、交换 profile、外部 session 或结果 provenance；现有
`NekoApplicationHandoffPort` 又只用于 Neko application instance，不能被扩展成第三方
应用协议。

## Goals / Non-Goals

**Goals:**

- 将内置轻量创作与外部专业制作建立明确产品分工。
- 支持 Desktop UI 直接“Open in…”以及 Agent 对应 MCP/API/Computer Use 操作。
- 保持 Neko 项目事实、导出 bundle、外部 app document 与返回 candidate 的身份分离。
- 复用现有 Agent、MCP、processor、plugin、permission 和资源边界。

**Non-Goals:**

- 在 Neko 内复制完整 NLE、DCC、图像编辑器、游戏引擎或 ComfyUI graph runtime。
- 声明所有第三方软件已有官方 MCP/API，或依赖未验证私有项目格式。
- 通过通用 shell、任意 URI、未绑定键鼠自动化、像素坐标宏或 active application
  fallback 驱动专业工具。
- 在本变更实现任何 tool adapter、应用探测或 round-trip watcher。

## Five-Layer Analysis

| 层 | 结论 |
| --- | --- |
| 职责 | 领域 owner 冻结 revision 并导出；Professional Tool service 发现/启动/绑定外部 session；Agent Tool Call 统一编排；MCP Manager 连接 MCP；Desktop Host 执行授权窗口观察与输入；外部应用拥有其 native document。 |
| 依赖 | renderer 只调用 typed Desktop bridge；Agent 只看 catalog/tools；automation adapter 通过 Host 授权访问 app/session/path/credential/window；领域包不依赖具体第三方 SDK 或 OS 输入 API。 |
| 接口 | integration contribution 分 launch、exchange、automation facet；automation 显式声明 transport、target binding、action traits 和 verification；handoff/result 携带 app、revision、resource、session 和 provenance。 |
| 扩展 | 新专业软件通过 plugin/builtin integration contribution 接入；不为每个工具新增 Shell 页面、Agent runtime、Computer Use loop 或 processor registry。 |
| 测试 | 隔离 fixture 与真实应用验证发现、启动、导出、MCP/Computer Use session、明确目标、用户接管、修改证据、取消和 round-trip；无应用或不具备 OS capability 时 fail-visible。 |

## Decisions

### 1. Two-tier authoring

- Built-in tier：Agent、Canvas、Cut、Preview、Assets、Character/World lightweight
  surfaces，负责快速生成、组合、预览、轻编辑、审阅和交换准备。
- Professional tier：DaVinci/剪映、Photoshop、Live2D、Blender、Unity、ComfyUI
  等，负责完整专业编辑、调色、资产制作、绑定、场景/游戏工程和复杂 workflow。

### 2. One professional integration contribution

每个 integration 贡献同一 identity 下的可选 facet：

- `launch`：installed/configured/unavailable、平台、版本、启动方式；
- `exchange`：输入/输出 media type、交换 profile、semantic loss、round-trip；
- `automation`：vendor MCP、第三方可信 MCP、Neko API adapter 或受控 Computer Use；
- `diagnostics`：缺少应用、版本不兼容、缺少 API/plugin、未授权路径、未连接 session。

GUI application 不是 External Processor。只有 headless、固定 argv、Host-owned output
的原子操作才进入现有 External Processor。

### 3. Explicit handoff transaction

领域 owner 先冻结 source revision，导出到用户选择或项目拥有的 durable bundle，
再由 Desktop Host 启动目标应用。外部 app project/document 只以 opaque external
document/session ref 进入 handoff receipt；不得成为 Neko project identity。

返回 Neko 的结果必须通过显式 import/relink/review，作为新 candidate、representation、
timeline revision 或 output；不得监听任意外部目录并静默覆盖项目事实。

### 4. MCP reuses the existing manager

UI “Open in…”直接调用 Professional Tool application service。Agent automation 由同一
service 的 Neko MCP adapter 或经验证 vendor MCP 暴露给现有 MCP Manager。两条入口共享
同一 integration catalog、path/trust/permission、session identity 和 diagnostics，不复制
launch/export 实现。

MCP mutation 必须携带明确 external session/document identity。若第三方 API 只能操作
active document，adapter 必须在操作前后验证 active document 与 handoff binding；无法
证明时拒绝执行。process exit、MCP success text 或 UI focus 不等于修改成功。

### 5. Computer Use is a controlled automation transport

Computer Use 不新增第二个 Agent loop。Agent 仍以现有 Tool Call、permission、approval、
transcript 和取消为 canonical path；Desktop Host 只提供受限的 observation/action port，
负责 OS 屏幕录制、Accessibility/Input 权限、窗口枚举、目标聚焦与输入注入。专业工具
adapter 负责声明：

- 精确 application/process/window/document binding；
- 允许的 click、type、shortcut、scroll、drag 等 action traits；
- 禁止或需逐次 approval 的文件选择、覆盖、删除、发布、登录、安装和网络上传；
- 操作前置条件、完成条件、证据等级和 bounded retry；
- 用户输入、窗口切换或目标失配时的暂停与重新绑定。

Computer Use 只能观察授权目标窗口或显式区域；默认不得读取其他应用、通知、密码管理器、
系统剪贴板或整个桌面。插件只可贡献机器可读的语义 profile 和验证规则，不得注入任意
坐标脚本。MCP/API 失败后不能静默 fallback 到 Computer Use；planner 必须把 transport
选择、风险和可验证性作为显式计划或 diagnostic。

结果证据按强到弱排序：目标 API/MCP state、durable artifact/filesystem state、应用
Accessibility/semantic UI state、redacted screenshot。截图和窗口焦点不能单独证明
专业写操作成功；只有视觉证据时，操作保持 `assisted`/`needs-review`，不得晋级为已验证
`write-automation` 或 round-trip 完成。

### 6. Capability levels are honest

每个工具按验证结果声明：

1. `launch-only`
2. `export-and-open`
3. `read-automation`
4. `write-automation`
5. `round-trip`

高级等级包含低级能力，但只对具体版本/平台/profile 有效。没有稳定 API/MCP 的软件仍可
通过 qualified Computer Use 扩展操作，但 capability 必须同时声明
`automationTransport`、`verificationLevel`、目标绑定和发布平台。未满足绑定和证据要求
时只能完成 export-and-open 或 assisted automation，不能冒充 write-automation。

## Risks / Trade-offs

- 第三方软件、版本、插件和 API 差异大，因此 catalog 必须按精确 target/version
  fail-visible，而不是维护模糊“已安装即可”承诺。
- 外部编辑会形成 Neko 与 native document 两套事实；显式 handoff/round-trip 可以
  保持所有权，但比共享 live state 更保守。
- MCP server 可能运行在 Host 权限下；现有 MCP trust/approval 必须与专业工具
  application/session/path binding 联合判断。
- Computer Use 依赖应用 UI、语言、缩放、OS 权限和桌面会话；能力必须按精确
  app/version/platform/UI profile 验证，且允许用户随时停止或接管。
- 剪映/CapCut 等工具若没有稳定公开交换或自动化边界，只能先发布 launch/export
  或 assisted Computer Use，不能逆向私有工程格式或仅凭视觉结果形成脆弱成功承诺。
