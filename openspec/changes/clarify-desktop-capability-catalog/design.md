## Context

当前实现已经具备四类 Skill source、personal Skill 安装、Plugin Skill/MCP composition、runtime
readiness、idle-only generation replacement 和 Extensions 管理 UI。现存问题集中在 distribution 与
authority：`AgentExtensionRepository` 同时读取 bundled `marketplace.json` 和 install root，Plugin
identity 固定为 `name@openneko`，manifest 位于私有 `.openneko-plugin` 目录，enable grant 写入独立
JSON 文件。官方仓库尚不存在，因此 marketplace 并没有真实远程发布、发现或更新消费者。

本地产品边界要求只有一条 canonical path。P0 不能保留 marketplace/local、旧/新 manifest 或
JSON/SQLite 双读，也不能因为 MCP/App runtime 尚未就绪而让合法 Skill package 消失。现有
`~/.neko/neko.db` 已是 machine-local UI-managed state authority，适合保存 Plugin lifecycle 和
enablement；Plugin bytes、`SKILL.md`、MCP document 与图标仍由 package filesystem owner 保存。

## Goals / Non-Goals

**Goals:**

- Skill 在没有 Plugin、MCP 和 marketplace 时仍可发现、管理、选择和执行。
- Plugin 使用一个根目录 `plugin.json` 和固定 component locations，减少 OpenNeko-specific shape。
- P0 只支持明确 bundled roots 与用户显式选择的本地 package，不维护 available marketplace catalog。
- SQLite 保存 Plugin 安装 lifecycle、启用状态和非敏感配置引用；filesystem 保存 package bytes。
- Skill、MCP 和未来 App contribution 独立验证与加载，单项失败不扩大到 sibling contribution。
- 保留唯一 Pi SkillHost、MCPManager、ToolRegistry、Agent turn 和 Desktop typed IPC 路径。
- Desktop Main 保持 Electron trust boundary 与 concrete adapter，host-neutral 策略归 Agent package。

**Non-Goals:**

- 官方/第三方 marketplace、远程搜索、下载、更新、发布者认证、签名和版本选择。
- 兼容读取 `.openneko-plugin/plugin.json`、`.codex-plugin`、Claude manifest 或旧 JSON grant。
- 为外部生态建立多个长期 parser 或运行时 contract；外部导入适配属于未来独立变更。
- 新建第二套 MCP manager、Agent loop、App/OAuth credential owner 或通用 package manager framework。
- 把 Plugin package bytes、secret、process handle、runtime health 或 Skill content 写入 SQLite。

## Decisions

### 1. 四层 authority 保持单一职责

| 层             | Canonical owner                           | 保存内容                                                                                               | 不保存内容                      |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 发布内容       | Plugin/Skill package filesystem           | `plugin.json`、`SKILL.md`、`mcp.json`、assets                                                          | 用户启用、授权、runtime state   |
| 安装与用户状态 | `neko.db#state` package-owned repository  | plugin identity、delivery source、relative install locator、install lifecycle、enabled、非敏感配置引用 | package bytes、secret、健康状态 |
| Host authority | Desktop Main adapters                     | exact root、picker grant、trash、SQLite connection、process/env/credential access                      | manifest policy、Agent routing  |
| Runtime        | Agent extension service / Pi / MCPManager | verified descriptor、read receipt、Tool、connection、readiness、cancellation                           | durable user choice             |

Filesystem package 是内容 authority；SQLite row 是用户安装和启用 lifecycle authority。普通 catalog
不得仅通过扫描任意目录创建成功的 installed record，也不得仅凭 SQLite row 报告 package ready。
SQLite row 指向 exact contained relative locator；package 缺失或损坏时保留 row 并投影局部 invalid
diagnostic，用户可以显式移除或重新安装。Builtin package root 是产品组合事实，不进入 personal install
registry，但其 enabled choice 仍由 SQLite 按 exact plugin id 保存。

选择 SQLite 而不是每 Plugin JSON grant，是因为 enablement/installation 是 machine-local、UI-managed、
需要查询和一致更新的 application state，并且现有 Desktop 已有单一 SQLite connection owner。不会新建
Plugin 专用数据库，也不会把 manifest 当作用户配置写回。

### 2. P0 没有 Marketplace

Agent extension application service 接收两个精确 source port：

- `bundledPluginRoots`：Desktop composition 显式注入的第一方 package roots；
- `installedPluginRepository`：SQLite rows 与 OpenNeko install root 的精确映射。

不存在 `marketplaceRoot`、available inventory、publisher index、refresh marketplace 或
`name@marketplace` identity。Extensions 的 rescan 只重新验证上述精确 sources。空 source 返回真实空
catalog，不读取 `~/.codex`、其他应用 cache 或未知文件夹。

未来官方仓库必须通过独立 OpenSpec 增加 distribution source adapter；下载并验证后的 package 仍进入
同一个 local install workflow。Marketplace 不得成为 runtime、enablement 或 Plugin identity owner。

### 3. Canonical Plugin package 使用 portable subset

Plugin 根目录必须包含 `plugin.json`。P0 portable top-level metadata 为：

- `name`：稳定 Plugin identity，在本地 catalog 唯一；
- `version`：发布者管理的第三方 package version；
- 可选 `description`、`author`、`homepage`、`repository`、`license`、`keywords`；
- 可选 `extensions`，其中 OpenNeko-specific metadata 只能位于 reverse-domain key。

Component 使用固定位置：`skills/`、`mcp.json`，不存在的位置表示未贡献该 component，不是错误。
OpenNeko-specific `mcpToolExposure`、展示 localization 或 automation profile 如确有消费者，进入
`extensions.io.openneko`；Skill content 不包含工具名、参数、轮询或 Host 协议。

Parser 使用 closed canonical shape，不读取 `.openneko-plugin/plugin.json`，不按 provider/version
切换 shape。Plugin `name` 直接作为 `pluginId`；冲突在 exact package scope fail visibly，不尝试按加载
顺序、publisher 或 marketplace 选择一个成功实现。

选择根目录 `plugin.json` 而不是继续私有目录，是为了让 package metadata 与 Agent Plugins 类生态的
通用结构可映射。P0 只承诺本仓库选定的稳定 subset，不声称兼容任一仍变化的完整外部规范；未来外部
格式只能在显式安装边界转换为这一 canonical package，不能加入 runtime 双读。

### 4. Skill 与 Plugin/MCP 解耦

Pi SkillHost 继续直接发现 builtin、personal、plugin 和 project roots，固定 precedence 为
`project > personal > plugin > builtin`。Personal/project/builtin Skill lifecycle 不调用 Plugin manager。
Plugin 只向 Pi SkillHost 提供 verified skill root 与 exact `pluginId` provenance。

一个 Plugin 的 components 分别产生 verification result：

- valid Skill 可以进入 Pi，即使同包没有 MCP 或 MCP 连接失败；
- valid MCP 可以进入既有 MCPManager，即使同包没有 Skill；
- unsupported App/OAuth 只产生该 component diagnostic；
- manifest/containment/identity 失败才拒绝整个 package；
- enabled Plugin 没有任何当前可执行 component 时显示 `unsupported`，但仍是可管理的 installed record。

Runtime generation 只消费 enabled、package-valid、component-valid descriptors。交换仍由 owning Agent
application service 串行化并要求相关 active turn/Automation session idle；新 generation 构建失败不替换
旧 generation，但失败 contribution 不从 manifest-only 或 sibling provider 获得成功状态。

### 5. 本地安装与跨 filesystem/SQLite 失败语义

Renderer 只发送 `installLocalPlugin` intent。Desktop picker 返回的绝对 path 仅进入 Main adapter；Agent
application service 通过 file port 完成 containment、symlink、大小、manifest、identity 和 component
验证，并规划 exact target。安装步骤为：

1. 复制到 install root sibling staging；
2. 验证 staging package 与目标 identity 唯一性；
3. 在 SQLite 创建可见 install lifecycle record；
4. 原子 rename 到 canonical relative locator；
5. 将 row 收敛为 installed，并重新计算 runtime generation。

跨 filesystem/SQLite 无法形成单一物理事务，因此 interruption 必须保留一个 exact、可见、不可执行的
install diagnostic，不得扫描 orphan bytes 自动注册、删除未知 package、回退旧 package 或伪装成功。
用户可以对精确记录重试安装或移除。Staging 只包含当前 operation 新建且尚未成为 package authority 的
临时 bytes，可以在失败时精确清理。

移除先验证 row、locator、manifest identity 和 runtime ownership，再移动 exact package 到系统废纸篓，
最后更新 SQLite。任一步失败保留 record 与 diagnostic；不得因文件缺失清空整个 catalog。Builtin Plugin
不可移除。启用/禁用只更新 SQLite，并在 idle boundary 重建 runtime。

旧 `${NEKO_HOME}/extensions/state/*.json` 不属于新产品输入：不读取、不导入、不删除，现有 bytes 原样
保留。新 SQLite 初始状态使用当前 canonical defaults，避免 migration/compatibility path。

### 6. Package ownership 与公共路径

| Responsibility                        | Owner / public entry                          | Producer                     | Consumer                                | Runtime boundary                  |
| ------------------------------------- | --------------------------------------------- | ---------------------------- | --------------------------------------- | --------------------------------- |
| manifest/catalog/install policy       | `@neko/agent-runtime/extensions`              | Agent application service    | Desktop AppHost、Agent composition      | host-neutral Node application     |
| durable Plugin state                  | `@neko/local-metadata` Plugin repository port | Desktop-owned SQLite adapter | Agent extension service                 | Desktop Main single DB connection |
| Skill discovery/receipt               | `@neko/agent-runtime` Pi public entry         | Pi SkillHost                 | Entry/Session input catalog、Agent turn | Node Agent runtime                |
| MCP connection/Tool                   | existing Agent MCP public entry               | Plugin runtime generation    | ToolRegistry/Pi                         | Node process/network boundary     |
| native selection/trash/process/secret | `apps/neko-desktop/src/main` adapters         | Electron Main                | Agent application ports                 | Electron trust boundary           |
| management presentation               | Agent contracts + Webview public entry        | AppHost typed projection     | Renderer                                | preload sender-bound IPC          |

保留在 `apps/neko-desktop` 的代码必须真实依赖 Electron `dialog`、`shell.trashItem`、app/resources path、
sender identity、SQLite connection composition、process environment 或 credential store。Manifest decode、
install state machine、support policy、sorting、readiness 和 runtime generation 都是 host-neutral 业务行为，
不得回流到 AppHost。

### 7. Management UI 只展示真实本地状态

Extensions 保留 Skills/Plugins 页签与文本搜索：

- Skills 展示 personal/plugin management projection；builtin/project 不作为全局可管理记录；
- Plugins 展示 bundled 与 SQLite-registered local records；
- 操作为 Add local、Enable、Disable、Remove、Rescan exact sources；
- 不展示 Available、Marketplace、Refresh marketplace、publisher catalog 或 marketplace category sorting；
- 排序使用稳定 Plugin display name/id，不把内容相关性或安装来源变成隐藏业务路由；
- author metadata 原样显示，产品 shell/diagnostics 支持 `en` 与 `zh-cn`。

详情页参考 VS Code Extension Details 的信息分层，但只消费 OpenNeko 已有真实 authority：

- Skill 概览展示 author-owned name/description、来源、稳定 Skill 名称与所属 Plugin；
- Plugin 概览展示 manifest display metadata、delivery source、publisher version/developer、
  contribution summary 与实际 component readiness；
- 默认概览不投影 Plugin 文件树、`plugin.json`、`mcp.json`、Skill prompt 正文、进程参数、
  环境、凭据、SQLite 记录、物理路径、fingerprint/locator 或 raw diagnostic；
- Personal Skill 的默认编辑器/文件夹操作由 Personal Skill manager 按当前 management id、
  fingerprint 与 personal root 重新解析 exact `SKILL.md`，Desktop 只注入 `shell.openPath`/
  `shell.showItemInFolder` concrete adapter；Renderer 不接收或回传 path；
- Plugin Skill 只可跳转到 exact owning Plugin overview，单独编辑/移除不得绕过 Plugin lifecycle。

这些 Host 操作不把 Skill 正文写入 catalog snapshot 或 SQLite，也不引入通用任意路径编辑器。
外部编辑完成后仍由已有 Pi rescan 重新校验；失效内容不得回退到旧 Skill 或同名来源。

### 8. 可执行 Skill identity 只能来自 Pi receipt

Management card、manifest display name、SQLite row 和 same-name search result 都不能直接成为 Agent invocation
identity。Entry/Session input catalog 必须从当前 Pi SkillHost records 投影完整 source、pluginId、fingerprint
和 locator identity；首发和后续 turn 使用同一 receipt。失效或同名冲突必须拒绝当前 invocation，不回退
personal/builtin/recent Skill。

## Risks / Trade-offs

- [Agent Plugins 外部规范仍可能变化] → P0 只采用最小 canonical subset；未来在安装边界一次性转换，不污染 runtime contract。
- [没有 Marketplace 限制发现与更新] → 当前只承诺 bundled/local 安装；等真实官方仓库和治理 owner 出现后再设计。
- [Filesystem 与 SQLite 跨资源中断] → 持久 lifecycle row、exact operation identity、可见 invalid 状态和用户显式重试/移除。
- [删除旧 reader 使开发期旧 package 不再出现] → 这是有意 breaking replacement；旧 bytes 不删除，但不提供兼容成功路径。
- [Contribution 局部成功增加展示复杂度] → 公共状态保持 plugin summary + per-component safe diagnostics，不暴露 raw process/path/auth details。
- [本地 Plugin 包含可执行 MCP 配置] → 显式用户安装与 enable、路径 containment、credential port、Tool/action approval 和 runtime ownership 继续作为独立真实门禁。

## Migration Plan

1. 原子更新 Agent/Desktop contracts，删除 marketplace/available 字段和操作，增加 local install 与 SQLite state port。
2. 在 `@neko/local-metadata` 增加 Plugin state repository，并由 Desktop 单一 SQLite owner 注入。
3. 实现根 `plugin.json` codec、固定 component discovery 和 contribution-local validation；删除旧 manifest/index parser。
4. 将第一方 Browser/Computer package 转为明确 bundled roots，删除 `extension-marketplace/marketplace.json`。
5. 实现本地 picker、staging、install lifecycle、trash removal 和 invalid-record projection。
6. 更新 runtime generation，使 Skill/MCP/App readiness 独立且 Skill-only Plugin 可用。
7. 更新 Extensions UI、Pi executable input catalog、双语 copy 和全部 producer/consumer tests。
8. 运行严格 OpenSpec、SQLite、Agent、Desktop、boundary、unused、build、真实 Electron 和 Agent Evaluation 门禁。

替换不提供 runtime rollback/dual-read。若本次发布整体回退，代码与资源作为一个 release 一起回退；新代码
不会读取旧 JSON grant 或旧 manifest。真实用户 package bytes 不由迁移脚本删除。

## Open Questions

- 官方仓库采用何种 index/API、签名和 publisher identity，留待存在真实发布治理 owner 后的独立 OpenSpec。
- App connector 与 OAuth MCP 的 credential/session owner 尚未定义，P0 继续逐 component 显示 unsupported。
