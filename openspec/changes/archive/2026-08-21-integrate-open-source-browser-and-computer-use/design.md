## Context

> **Successor disposition (2026-08-20):** `replace-pi-with-dsh-runtime-atomically` supersedes this change's OpenNeko Plugin catalog, Skill Host, MCP Manager, Tool Registry, Pi Tool Call and production Automation composition. Browser Use/Cua upstream compatibility, exact target, OS permission, action approval and evidence rules remain input to the successor, but no task or requirement here authorizes a production success path. The successor owns DSH MCP contribution wiring, deletion of old registrations/contracts and new Evaluation evidence.

OpenNeko 已经存在一条通用插件链路：

```text
Plugin manifest
  -> Skill roots / ordinary MCP descriptors / Apps
  -> AgentPluginRuntime
  -> MCPManager
  -> ToolRegistry
  -> Pi Tool Call
```

Browser Use 和 Cua Driver 不应产生第二套插件市场、安装器、权限中心或 Agent runtime。它们与普通第三方
扩展的差异仅在于：OpenNeko 为已知 Browser/Computer operation 提供 product-owned adapter，从而绑定
精确目标、OS 权限、动作审批与观察证据。

上游版本仍是第三方事实，但不再是 OpenNeko 内部资格代际。当前已审计基线可用于文档、测试和问题诊断：

| Dependency  | Audited baseline                   | Reused boundary                        |
| ----------- | ---------------------------------- | -------------------------------------- |
| Browser Use | `browser-use/browser-use` `0.13.7` | `uv tool install 'browser-use[cli]'`   |
| Cua Driver  | `trycua/cua` `0.19.2`              | Cua Driver MCP                         |
| MCP SDK     | `@modelcontextprotocol/sdk@1.30.0` | stdio/Streamable HTTP protocol adapter |

该基线不表示只有相同字符串版本才能运行。能否接入由当前 MCP handshake、server identity、所需 operation
和 adapter 依赖字段的结构兼容性决定。

## Goals / Non-Goals

### Goals

- 为个人、第三方和 OpenNeko Plugin/Skill/MCP 提供同一公开接入模型。
- OpenNeko 显示并允许复制上游安装命令，但绝不执行命令或拥有第三方文件生命周期。
- Browser/CUA 只复用上游控制实现，不开发浏览器控制、截图或输入引擎。
- 保留唯一 MCP Manager、Tool Registry、Pi Tool Call 和 Agent transcript 路径。
- 只在真实边界执行权限检查，并让单个扩展或 Tool 失败保持局部可见。

### Non-Goals

- 插件市场式认证、发布审批、资格徽章或第三方效果保证。
- 当前交付中的托管 artifact 下载、更新、卸载、SBOM 或供应链发布系统。
- 通过固定版本、完整目录 digest 或完整 Tool Schema digest 建立兼容性。
- 把 Skill prompt、MCP annotation 或 manifest 权限字符串当作执行授权。
- `PATH` 扫描、自动安装、失败后切换 provider/runtime 或复用 active/recent target。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | Extension service 只拥有发现、启停和诊断；MCP Manager 拥有协议连接；Automation 拥有 session/target/action；Desktop Host 拥有路径、进程、OS 权限和窗口 concrete adapter。 |
| Dependency     | Agent/Automation contracts 保持 host-neutral；Renderer 不接触 Node/Electron；上游 runtime 不成为 workspace package 依赖。                                                |
| Interface      | Plugin、Skill、MCP 使用公开 contract；Browser/CUA adapter 只声明所需 operation 和字段，不声明完整上游实现。                                                              |
| Extension      | 新第三方 Plugin/Skill/MCP 不需要 OpenNeko 注册表；新 Browser/Computer adapter 只有在需要产品目标/动作语义时才加入 Automation。                                           |
| Testing        | 通用接入验证发现、启停、MCP handshake/schema parse 和 fail-local；Automation 额外验证精确目标、OS 权限、审批和结构兼容。                                                 |

## Decisions

### 1. Extension 是开放加载器，不是资格管理器

Extension 公共状态只表达用户能采取行动的事实；目录中的记录已经代表本地来源存在，因此不再复制
`installed`/`not-installed` 状态：

```text
discovered + disabled -> enabled + ready/error
```

`enabled` 是加载贡献的唯一 durable consent。删除独立 `enableGrantStatus`、`declaredPermissions`、
`acceptedPermissions`、`dependencyStatus`、`hostPermissionStatus` 和 `qualificationStatus` 公共投影。

Manifest 中的第三方元数据可以保留给来源展示或未来生态工具，但不参与 OpenNeko 执行授权。若未来某个
权限声明能够映射到真实 sandbox/capability gate，应由拥有该 gate 的独立变更定义，不得先建立字符串矩阵。

普通 Plugin 启用后加载它声明的 Skill、MCP 和 App。单个贡献解析或连接失败返回 extension diagnostic；
有效 sibling 不受影响。相同 identity 不允许 silent overwrite、first-compatible 或 try-next。

当前没有远程插件目录、发布服务或可用 artifact Host，因此 Extension 公共 contract 不保留未来市场可能使用
的下载、更新、取消、传输进度、签名、provenance、license inventory、staging、commit 或 rollback 语义。
目录刷新只重新扫描当前已配置的本地来源。若未来提供真实 Marketplace，必须由独立变更基于实际发布者、
下载边界和恢复需求重新定义最小生命周期，不能复活当前未被使用的预留框架。

### 2. Skill 使用公开目录与统一信任边界

OpenNeko 发现 builtin、personal、workspace 和 plugin Skill roots。官方安装器把同一 Skill 安装到不同 Agent
目录时，OpenNeko 只读取属于自己的公开目录；第三方也可以直接创建符合约定的 `SKILL.md`。

- Personal/plugin Skill 可被发现和选择。
- Workspace Skill 继续由 Workspace Trust 决定是否可用。
- `allowed-tools` 只能缩小当前可用 Tool 集，不能授予新 Tool。
- Skill 引用的外部脚本仍由 external processor authorizer 决定是否执行。
- Skill 正文不得承载运行时 Tool 协议、命令参数表或子包内部 schema。

### 3. 普通 MCP 只要求标准协议兼容

官方 MCP SDK 是唯一 transport adapter。普通 MCP 接入流程为：

```text
enabled plugin
  -> connect exact configured server
  -> MCP handshake
  -> list tools
  -> strict parse each Tool
  -> ToolRegistry
  -> per-call permission/confirmation
```

普通 MCP 不需要固定 package version、完整 schema digest 或资格记录。Malformed Tool 只隔离该 Tool；连接失败
只影响该 server/plugin。Generic MCP Tool 继续按现有策略要求调用确认，annotation 只是非可信 hint。

### 4. 外部原生依赖由用户安装，OpenNeko 提供命令

Browser Use 和 Cua Driver 使用 `user-managed-local-runtime`。Source descriptor 提供：

- 显示名称和上游安装指南；
- 一个面向用户、可复制但永不自动执行的安装命令；
- 必需资源列表，例如 Browser Use runtime 与 browser executable；
- MCP server 名称和 adapter 所需 operation/字段。

OpenNeko 保存 opaque `runtimeId`，Host 保存用户明确选择的 exact realpath/bundle authority。OpenNeko 不扫描
`PATH`、不猜测最近安装、不执行 `pip`/`uvx`/`curl`/PowerShell，不更新或删除外部文件。重新选择替换当前
authority；断开只删除 OpenNeko 授权。

Browser Use 直接使用上游公开的 PyPI 分发，不 fork 或维护 OpenNeko 专用构建。OpenNeko 复制
`uv tool install 'browser-use[cli]'` 作为持久安装命令，使用户随后可以明确选择生成的 `browser-use` 入口；
上游 MCP 文档的 `uvx --from 'browser-use[cli]' browser-use --mcp` 仅是用户手动启动服务的示例，不是
OpenNeko 的安装或运行时授权路径。两种命令均不参与 runtime identity，也不构成效果保证；安装、更新与
卸载完全属于用户和 `uv`，OpenNeko 不接管该生命周期。

标准 `uv tool install` 入口可以通过符号链接指向工具环境脚本，脚本 shebang 也可以指向工具环境的 Python
链接。Desktop Host 必须解析并冻结入口 realpath、shebang interpreter realpath 和独立浏览器 executable
realpath；启动时直接使用冻结的解释器执行冻结入口，并在连接前重验三者。符号链接目标变化只使当前
runtime 失败，不扫描 `PATH` 或选择替代解释器。

当前交付只组合一个显式选择的 `user-managed-local-runtime`。Browser/CUA 专用 remote endpoint manager 不进入
Extensions UI、Desktop IPC 或 Automation provider 选择；普通远程 MCP endpoint 继续走既有通用 MCP Manager。

### 5. 兼容性检查替代资格与精确版本检查

Local runtime 状态收敛为：

```text
not-configured | ready | error
```

UI 不显示“已资格化”“未资格化”“第三方/未验证”。失败时只展示可执行的具体 diagnostic，例如资源缺失、
资源变化、MCP 无法连接、缺少所需 operation 或 operation shape 不兼容。

兼容性检查包括：

1. 用户选择的资源仍解析到同一 exact realpath/bundle identity；
2. executable/app 可启动，MCP handshake 成功；
3. server name 与 adapter 目标一致；server version 仅记录用于诊断；
4. adapter 所需 operation 存在；
5. operation input schema 是 object，且 adapter 注入或读取的字段存在并具有兼容结构；
6. upstream annotation 不能把已知 mutation 降为 read-only，也不能扩大权限；
7. Cua macOS 保留 bundle identifier、Developer ID/Team ID、notarization 和稳定 TCC responsibility chain 检查。

不再检查 Browser Use package 版本字符串、Cua bundle short version、MCP server version 相等、完整 runtime
目录 digest 或完整 Tool input schema digest。文件 identity 变化仍要求用户重新授权，因为这是路径 authority，
不是资格认证。

兼容性代码和诊断使用 `compatibility` / `inspection` 语义，不把结构检查命名为 qualification。第三方 release
不属于 `AutomationProviderIdentity`，也不复制到 session control、target selection 或授权 identity；Host 若能
可靠读到 release，可在 owning runtime 的可选诊断详情中显示，缺失 release 不影响 ready/error。

### 6. Browser/CUA 使用产品拥有的最小 adapter

普通 MCP 可以直接投影 Tool；Browser/CUA 的自动化 operation 必须经过 product-owned wrapper，因为目标、
权限和动作语义不属于上游 annotation。

Browser 首期保留 `observe` 的直接读取 operation；不暴露任意 Python、`browser_exec`、嵌套 Agent、文件访问
或 cloud fallback。每个 session 使用隔离 home/temp/browser-data，运行时和 browser executable 分别授权。
这里的 browser executable 是用户安装的外部 Chrome/Chromium 兼容浏览器进程，不是 OpenNeko Renderer
WebView；WebView 不拥有浏览器进程、CDP、页面 session、文件或网络授权。

Browser 首期不接管用户已经打开的 Chrome tab，也不在 discovery client 与 execution client 之间转交上游 tab
identity。用户为当前 Tool Call 确认一个 canonical HTTP(S) origin；Automation session 为该 origin 创建一个独占
Browser Use MCP client、隔离 browser profile 和唯一 page。Host 可以在 client 连接后通过上游
`browser_navigate` 完成一次受限的 session bootstrap，但该 operation 不注册为 Agent Tool；之后只允许 direct
observe operation。连接后、每次 observe 前后都必须通过上游 `browser_list_tabs` 验证 client 仍只有一个 page，
且 page origin 仍等于授权 origin。popup、新 tab、跨 origin redirect 或第二 client 都使当前 session fail-visible。

这一边界不依赖上游 atomic tab-target operation，因为唯一 page 就是 session-owned exact target；也不允许 fork
Browser Use、active-tab switching、共享可变 client、默认浏览器推断或平行 CDP controller。未来若要接管用户已有
tab，必须通过独立变更等待上游提供可转交的完整 session/tab identity 和原子 observe operation。这个限制不阻塞
Cua 的独立、精确 window adapter 注册。

Computer session 绑定 exact app/process/window/region。Host 在 mutation approval 前及输入前重新验证 target；
Screen Recording、Accessibility/Input 使用当前 OS 状态。Pause、Stop、Take over 只作用于精确 session。

未知 operation 不进入 Automation wrapper，但可以在普通第三方 MCP 插件中按普通 Tool 规则出现；两条路径
由明确 plugin descriptor 和 exact owner 区分，不能 fallback 或重复注册。

### 7. 权限只存在于真实执行边界

| Boundary           | Authority                       | Scope                                    |
| ------------------ | ------------------------------- | ---------------------------------------- |
| Plugin enablement  | Extension service + user action | 是否加载该 Plugin 的贡献                 |
| Tool invocation    | Pi permission/preflight         | 当前 Tool Call 的副作用                  |
| OS permission      | Host/operating system           | 当前文件、屏幕、Accessibility/Input 能力 |
| Automation session | Automation application service  | exact profile/target/mode/owner/budget   |
| Mutation approval  | Pi Tool Call                    | 当前 target/effect/action                |

这些 authority 相互独立且不可替代。版本字符串、安装成功、Skill 文本、MCP annotation、process exit code 或
成功文本都不能授予权限。

### 8. Failure and data boundaries

- Invalid Plugin/Skill/MCP/Tool/local runtime 只产生 owning record diagnostic。
- Runtime path 变化拒绝当前 source，不搜索替代安装。
- MCP failure 不切换 Browser/Computer provider。
- Screenshot bytes 只通过短生命周期授权投影进入当前 turn；durable transcript 保存 redacted receipt。
- OS permission 丢失或 target 改变只暂停/终止 exact Automation session。
- Renderer 只看到 opaque identity、用户可理解名称、动作和 safe diagnostic，不看到绝对路径、window handle、
  secret 或持久 raw screenshot。

## Evaluation plan

- Contract tests：Extension projection 不再接受资格/权限矩阵；local runtime projection 不再接受资格标签；
  operation compatibility 使用最小结构而非 digest。
- Runtime tests：Plugin enabled/disabled、普通 MCP connect/list/call、Skill discovery/workspace trust、单个失败隔离。
- Browser tests：不同上游 patch/minor version只要兼容即可连接；缺 operation/不兼容字段拒绝；无 PATH fallback。
- Cua tests：release 字符串变化不阻塞；bundle/signature/TCC identity 变化阻塞；target/action 权限保持精确。
- UI tests：显示复制命令、选择资源、重新检查、断开和错误；不渲染资格/未验证/权限矩阵。
- 真实 Desktop Evaluation：Browser observe、Computer observe、mutation denial、target mismatch、cancel/takeover，
  并记录未执行平台风险，不用 mock 声称真实能力通过。

## Replacement plan

1. 修订 Extension 和 local-runtime canonical contracts，删除 artifact operation 与专用 endpoint 路径，并原子
   更新 producer、consumer、fixtures 和 tests。
2. 删除 Extension accepted-permission persisted shape，启用状态只保存 `{ pluginId, enabled }`。
3. 删除资格 UI 和 locale keys，新增安装命令复制入口。
4. 将 Automation operation digest equality 替换为所需字段结构兼容检查。
5. 移除 Browser/Cua exact release/server-version gate，保留精确路径与 Cua 签名/TCC gate。
6. 从 Automation identity/session projection 移除第三方 release 必填字段，将 qualification 命名收敛为
   compatibility inspection。
7. 运行聚焦 package tests、strict typecheck、OpenSpec、Agent Evaluation 和 quality review。

本变更不保留旧 contract 或 dual-read。旧的非 authoritative enable/local-runtime presentation state 按当前
canonical fresh state 局部重置并显示 diagnostic，不影响插件文件、用户内容或其他 Workspace。
> **后继处置（2026-08-21）**：Pi-specific browser/computer execution 设计仅作历史记录；保留的 Automation 安全与证据边界不变。
