## Context

第一轮实现已经把 Home 从产品模块目录改成 Codex enabled plugin manifest 目录，后续又
错误地把 Codex CLI 和 OpenAI marketplace 当成分发 authority。OpenNeko 是基于 Pi Agent
的独立应用，不得读取、修改或展示其他应用的 marketplace、安装状态和本地缓存。用户要求
OpenNeko 自己维护真实插件，并让安装后的 portable Skill/MCP contribution 被 Agent 感知和
执行。

真实 owner 边界：

1. OpenNeko public repository 中的 versioned marketplace snapshot 拥有可安装插件事实；
2. OpenNeko 安装根拥有已安装 package 事实，`.openneko-plugin/plugin.json` 拥有展示
   metadata 与 contribution locator；
3. Pi SkillHost 拥有 Skill discovery、fingerprint、selection 与 read receipt；
4. `MCPManager`、MCP Tool wrapper 与 Pi Tool projection 拥有 MCP 连接和调用；
5. `@neko/agent-runtime/extensions` 的 support policy 组合 Pi SkillHost 与 OpenNeko MCP parser，拥有
   可安装插件的产品兼容性判定；
6. `@neko/agent-runtime/extensions` 拥有 catalog、contained atomic install/remove workflow、runtime
   generation 和 operation state；Desktop Main 只拥有 marketplace snapshot/install-root、文件/进程/
   credential concrete adapter、typed IPC、composition 与 disposal；
7. Renderer 只拥有搜索、固定内容创作优先排序、operation 状态、确认与本地化展示。

公共能力与复用审计结论：

- 复用 Pi SkillHost、现有 MCP runtime、ToolRegistry、Desktop global storage、双语 i18n
  和 management Surface primitives。
- 不复用 Shell `domains`、Webview `pluginsAvailable` 或 plugin transfer runtime；它们是产品
  模块与 send-to target，不是插件 lifecycle。
- 不读取或写入 `~/.codex`、Codex config/cache/marketplace，不调用其他应用 CLI，不创建
  第二套 Agent 或 MCP protocol。
- App connector 没有可复用的 OpenNeko runtime owner，因此本次只投影 unsupported 状态。

## Goals / Non-Goals

**Goals:**

- Home 管理 installed/available 插件和 personal/plugin Skill；builtin Skill 仅属于 Pi Agent
  runtime，不进入管理目录。
- installed 目录只保留 OpenNeko 安装根中的插件；available 目录只包含 OpenNeko repository
  中由 Pi Agent / OpenNeko 当前支持的 Skill 或 MCP contribution。
- 默认优先显示内容创作相关插件，其次通用生产力，再显示其他受支持插件。
- 插件 add/remove/reload 只作用于 OpenNeko marketplace snapshot 和 OpenNeko global
  install root。
- personal Skill 本地安装/移除进入 Pi SkillHost 的同一全局 root。
- plugin Skill 和兼容 MCP contribution 进入 Pi Agent canonical path。
- Computer Use 的 MCP Tool 只有在实际连接和 Tool discovery 成功后才标记 ready。
- 物理路径、命令、参数、env、credential 和 raw diagnostic 不跨 preload 边界。
- project > personal > plugin > builtin 的 Skill selection 确定且可诊断。
- 插件 mutation 不打断 active turn；runtime generation 只在 idle 时切换。
- `en` / `zh-cn` UI 完整；作者 metadata 保持原文。

**Non-Goals:**

- 任意 foreign marketplace source 的新增/删除或导入 UI。
- 为 App connector、OAuth MCP 或远程 connector 新建认证系统。
- 翻译第三方 manifest/personal Skill 内容。
- 在 active Agent turn 中热卸载或切换 Tool implementation。
- 把“已安装”当成“已连接”；runtime readiness 必须来自实际 Skill/MCP composition。

## Decisions

### 1. Home Surface 命名为“扩展”

一级导航和页面标题使用 `Extensions / 扩展`。页面保留两个页签：

- `Skills / Skill`：Pi SkillHost 发现的 personal/plugin 全局 Skill；
- `Extensions / 扩展`：OpenNeko marketplace 或 OpenNeko 安装根中的插件包。

页面不再出现“内置能力”页签，也不从 Shell `domains` 读取目录项。

### 2. OpenNeko repository 是唯一 inventory/mutation authority

Agent extension application service 通过注入的 repository/file ports 读取 versioned OpenNeko
marketplace snapshot，并只管理 `${NEKO_HOME}/extensions/plugins` 下的 installed package。Desktop
Main 解析实际 app path 并注入受限 adapter，不解释 manifest 或决定 mutation。首阶段 snapshot 位于公开
`OpenNekoPaw/OpenNeko` 仓库并随 Desktop 打包，因此不需要 registry 服务，也不依赖用户
机器上的 Codex/OpenAI marketplace。未来远程 Git snapshot 只能替换 repository port，不能
改变安装根、package contract、trust 或 Pi runtime owner。

available 项必须再经过 Agent runtime 拥有的 support policy：

- Skill contribution 必须能被 Pi SkillHost 发现且没有 diagnostic/warning；
- MCP contribution 必须至少包含一个 OpenNeko 当前支持且通过 containment/auth 校验的
  stdio 或 HTTPS transport；
- App-only、OAuth-only、无 Agent contribution、非法 Skill/MCP 的 available 项不进入目录；
- 已安装项始终保留用于状态诊断和卸载，即使当前 unsupported/error。

`.openneko-plugin/plugin.json` 只允许 contained relative contribution locator。OpenNeko
repository index 只接受 publisher `OpenNeko`、schema version 1、唯一 package id 和 contained
package path。没有真实 entry 时必须返回空 available catalog；不得扫描 `~/.codex`、其他应用
缓存或把 builtin Skill 包装成插件。

每次 list 计算 immutable `catalogRevision`。mutation 携带 expected revision；陈旧请求、
无效 repository/index/package 明确失败，不能假成功。安装复制到 sibling staging，完成
containment、manifest、Pi/MCP support 校验后原子 rename；移除移动到系统废纸篓。成功
mutation 后重新读取 catalog，再更新 Agent runtime。

### 3. 插件 runtime generation

Agent runtime extension service 拥有一个当前 plugin generation：

- verified plugin Skill roots；
- 已连接 MCP manager 和动态发现的 MCP Tool；
- 每个 plugin 的 readiness/diagnostic；
- generation revision。

构建新 generation 时先完整发现并连接；只有没有 active turn 时才交换到所有 workspace。
workspace unregister 旧 plugin Tool、register 新 Tool，然后旧 MCP manager 显式 dispose。构建
失败保留旧 generation并返回明确 diagnostic；不回退 manifest-only success。

MCP stdio `cwd`、相对 command、允许继承的 env 名称和 timeout 由 Agent extension service 解析并
通过受限 process/env port 执行。HTTP bearer credential 通过 Desktop 注入的 secret adapter 解析；
OAuth 尚无 owner，标记 unsupported。MCP Server id 冲突
或 Tool name 冲突使对应 plugin 不进入 ready generation。

### 4. Skill source 与管理

`SkillSource` 增加 `{ kind: 'plugin'; pluginId: string }`。选择优先级固定为：

`project > personal > plugin > builtin`

多个 plugin 提供同名 Skill 时使用 stable plugin id 排序并产生 duplicate diagnostic。Plugin
Skill fingerprint、locator 和 read receipt 继续由 Pi SkillHost 计算；manifest metadata 不能
代替 Skill receipt。

personal Skill 安装由 Desktop native picker 返回授权来源，Agent extension service 在临时 staging
内进行 containment、symlink、大小和 Pi discovery 校验，再经注入 file port 原子写入
`~/.agents/skills/<name>`。已存在目标 fail-visible。
移除只接受 Main 重新解析出的 opaque management id，并移动到系统废纸篓。builtin 与 plugin
Skill 不提供单独移除。

Pi SkillHost record 继续保留 canonical `name/description`。Home management projection 在 Main
侧只投影 personal/plugin Skill，并排除 builtin record、builtin diagnostic 以及仅由 builtin
参与的 duplicate warning。personal/plugin Skill 显示作者原文。UI locale 不改变
fingerprint、调用 identity、模型可见 description 或 Skill content。

Pi SkillHost 已验证并纳入当前 generation 的插件 Skill 进入 Skill 页签，使用 plugin source 与
pluginId provenance 展示；它们不能单独删除，只随插件 install/remove 生命周期管理。manifest
仅声明但 Pi validation 失败的 Skill 不进入页签，也不能标记为 Agent ready。

### 5. 管理 contract

Extension item 包含 installed/available 状态、category、contribution summary、
compatibility 和 runtime readiness。Skill item 包含 source、pluginId（适用时）、
management id 与 allowed actions。mutation contract 独立于 list：

- install/remove plugin；
- reload OpenNeko marketplace；
- install/remove personal Skill。

所有 mutation 都携带 sender-bound endpoint epoch、request id 和 expected catalog revision；
不保留旧 capability 或只读 extension fallback。

### 6. 搜索与固定排序保持确定性

Extensions 默认使用产品推荐排序：`Creativity` 优先，其次 `Productivity`，再到研究/数据相关
类别，最后是其他 OpenNeko 支持的类别；同级 installed 优先，再按稳定 display name/id 排序。
Skills 固定按 personal、plugin 来源顺序和稳定名称排序。插件作者 metadata 保持原文。

Renderer 只提供跨两个页签的文本搜索，不再暴露来源、状态、分类或排序 select。这些控件
在当前目录规模下没有足够价值，并增加了理解和操作成本。删除只影响 Renderer presentation；
Main contract、目录记录、卡片状态/来源标识和 Agent runtime 保持不变。

### 7. Internationalization

`en` / `zh-cn` 覆盖标题、搜索、来源、状态、compatibility、runtime readiness、安装、卸载、
刷新、确认、busy/error 和空态。personal/plugin Skill 与 extension manifest 的作者 metadata
不翻译。

### 8. Home management contract 破坏性升级

contract version 升级并一次性替换：

- IPC channel 从 `home:capabilities:list` 改为 `home:extensions:list`；
- request/result 从 `Capabilities` 改为 `Extensions`；
- 删除 `DesktopHomeBuiltinCapabilityItem` 与 `capabilities`；
- 增加 `DesktopHomeExtensionItem`、`extensionDiscovery` 与 `extensions`；
- bridge 从 `home.capabilities` 改为 `home.extensions`。

Main、preload、Renderer 和测试同时迁移。旧 payload/channel 不保留兼容分支。

### 9. Renderer 在 Home 请求前建立 sender-bound identity

Home management request 升级后必须携带当前 Desktop endpoint epoch。Renderer 入口在挂载 React 前并行完成基础 `bootstrap.get()` 与 settings 初始化；只有两者都完成后，Extensions Surface 才可能发起目录请求。preload 只接受 bootstrap 记住的 sender-bound identity，缺失或陈旧 epoch 直接失败，不回退当前 active window 或无 identity 请求。

## Risks / Trade-offs

- [OpenNeko marketplace schema 漂移] → versioned strict schema 和 fail-visible diagnostic。
- [误读其他应用状态] → repository root 与 install root 均由 OpenNeko Desktop Main 显式
  注入；测试 poison `~/.codex`/foreign marketplace 并证明不会读取。
- [第三方 category 不稳定] → 未知类别进入最低推荐优先级，不影响支持判定或显式名称排序。
- [安装会修改 OpenNeko 用户数据] → 明确用户命令、确认、revision fencing、contained atomic
  install 和 recoverable removal。
- [MCP process/HTTP 生命周期] → generation owner、idle-only swap、超时和显式 dispose。
- [插件代码信任] → 只有用户安装且 manifest 可验证的 contribution 进入 runtime；外部 processor
  仍受 workspace trust/permission；OAuth/App 无 owner 时拒绝。
- [中文 UI 出现英文插件描述] → 作者 metadata 保持原文；所有产品 shell 和状态完整本地化。

## Migration Plan

1. 升级 OpenSpec 与 typed management contract，poison Codex/foreign marketplace path。
2. 以 OpenNeko repository/installer 替换 Codex CLI adapter并实现 plugin mutation。
3. 扩展 Pi Skill source并组合 plugin Skill roots。
4. 组合 MCP generation、Tool projection和 idle-only replacement。
5. 增加 personal Skill install/remove manager。
6. 更新双语管理 UI 与 producer/consumer tests。
7. 运行 Agent evaluation harness、Desktop build、真实 Electron 和聚焦 Agent path 验证。

迁移不导入 Codex/OpenAI 已安装插件；OpenNeko install root 初始为空。用户的其他应用插件、
Skill、设置、凭据和缓存保持不变。

## Open Questions

OAuth MCP 与 App connector 需要独立认证/connector owner。本次必须显示 unsupported，不得以
manifest 声明或 Codex 安装状态代替 OpenNeko runtime readiness。
