## Context

Home 当前通过 Pi SkillHost 读取 personal/builtin 全局 Skill，同时把 Shell `domains` projection 中的产品模块当作第二类目录项。用户需要的第二类事实不是产品模块，而是本机全局 Agent 环境实际启用的插件，以及这些插件 manifest 声明的 MCP Server、Skill 与 App 贡献。

当前真实 owner 边界如下：

1. Pi SkillHost 是 OpenNeko Agent 实际使用的 Skill discovery owner；
2. Codex `config.toml` 的 `[plugins."<name>@<marketplace>"] enabled = true` 是本机 Codex 全局插件启用事实；
3. `~/.codex/plugins/cache/<marketplace>/<name>/<version>/.codex-plugin/plugin.json` 是插件包展示元数据与 contribution 声明；
4. OpenNeko Desktop 当前没有已组合的 Plugin Host、MCP Manager 或 Computer Use Host port，不能把 manifest contribution 宣称为 OpenNeko runtime 已连接能力。

公共能力与复用审计结论：

- 继续复用 `@neko/shared` 的 TOML reader、Desktop 双语 i18n、Pi SkillHost 与现有 management card/grid primitives。
- 不复用 Shell `domains`、Agent Webview `pluginsAvailable` 或 plugin transfer runtime；它们分别表示产品模块状态和项目 send-to target，不是全局扩展安装目录。
- 新增 reader 留在 Desktop Main，因为它读取 Host 文件、解释 Codex 本机目录布局并只服务 Desktop presentation；Renderer 只消费无路径 DTO。
- 不创建第二个 MCP Manager，不连接插件 MCP Server，也不把插件内 Skill 注入 OpenNeko Agent runtime。

## Goals / Non-Goals

**Goals:**

- Home 只展示全局扩展包和 personal/builtin Skill，不展示 Canvas、Cut、Preview、Agent 等产品内置模块。
- 只展示 Codex 全局配置明确启用、且本地缓存 manifest 可验证的插件。
- 展示插件 manifest 的 MCP Server、Skill 与 App contribution，让 Computer Use 等插件可被准确识别。
- 物理路径、命令、参数、env、credential 和 raw diagnostic 不跨 preload 边界。
- personal Skill 覆盖同名 builtin Skill，project Skill 永不进入 Home。
- `en` / `zh-cn` UI 完整；builtin Skill 本地化，插件/personal 作者元数据保持原文。
- 新 contract 删除 builtin capability DTO，旧 payload 与旧 IPC channel 不再成功。

**Non-Goals:**

- 在 OpenNeko 中安装、启用、停用或更新 Codex 插件。
- 把 Codex 插件 manifest 声明等同于 OpenNeko Agent 已加载、MCP 已连接、工具可调用或 Computer Use 已授权。
- 启动 MCP Server、枚举动态 MCP tools、读取 connector secret 或执行 Computer Use。
- 将插件内 Skill 注入 Pi SkillHost，或翻译第三方 manifest/personal Skill 内容。
- 实现 Marketplace、Professional Tool catalog、trust 或权限管理。

## Decisions

### 1. Home Surface 命名为“扩展”

一级导航和页面标题使用 `Extensions / 扩展`。页面保留两个页签：

- `Skills / Skill`：Pi SkillHost 发现的 personal/builtin 全局 Skill；
- `Extensions / 扩展`：Codex 全局配置明确启用的插件包。

页面不再出现“内置能力”页签，也不从 Shell `domains` 读取目录项。

### 2. Desktop Main 读取真实 Codex 全局插件注册

Desktop 启动时把 Codex home 显式注入 extension reader。默认路径为 `CODEX_HOME`（存在时）或用户 home 下的 `.codex`。Reader：

1. 使用共享 TOML reader读取 `config.toml`；
2. 只接受 `plugins` table 中 `enabled: true` 的 `<name>@<marketplace>` 注册；
3. 在 cache 的精确 marketplace/name 边界内查找唯一版本包；
4. 验证 `.codex-plugin/plugin.json` 的 identity、version、展示字段与 contribution locator；
5. 对 `mcpServers` / `apps` JSON 只投影顶层稳定 id；`skills` 只投影是否存在该 contribution；
6. 对结果按 stable id 排序并冻结。

缺失 `config.toml` 或没有 enabled plugin 是正常空目录。非法 TOML、非法 registration id、缺失/多版本缓存、无效 manifest 或无效 contribution 返回安全 code/count，并跳过不能证明的记录。

### 3. Extension DTO 是展示投影，不是 runtime availability

每个 extension record 只包含：

- `id`：`<name>@<marketplace>`；
- manifest `name`、display name、description、version、developer；
- marketplace id；
- MCP Server ids、是否含 Skill contribution、App ids。

不包含路径、logo locator、command、args、cwd、env、URL credential、token 或 raw parser message。DTO 不包含 `connected`、`available`、`trusted` 或 `installed` 布尔值，因为当前 OpenNeko 没有相应 authority。界面只表达“全局配置已启用并发现 manifest”。

### 4. Skill 运行元数据与 UI 展示元数据分离

Pi SkillHost record 继续保留 canonical `name/description`。Renderer 仅对已知 builtin name 使用 Desktop i18n 展示映射；personal Skill 显示作者原文。UI locale 不改变 fingerprint、调用 identity、模型可见 description 或 Skill content。

插件内 Skill 不进入 Skill 页签，因为当前 OpenNeko Pi SkillHost 不发现或执行它们。扩展卡只显示该插件声明了 Skill contribution，避免伪造 runtime 支持。

### 5. 搜索、筛选和排序保持确定性

Skills 页签保留 `all | personal | builtin` 来源筛选；`all` 下 personal 先于 builtin，组内按显示名称稳定排序。

Extensions 页签按 manifest display name 排序；搜索匹配 stable id、manifest name/display name/description、developer、marketplace、MCP Server id 和 App id。插件元数据保持作者原文。

### 6. Home management contract 破坏性升级

contract version 升级并一次性替换：

- IPC channel 从 `home:capabilities:list` 改为 `home:extensions:list`；
- request/result 从 `Capabilities` 改为 `Extensions`；
- 删除 `DesktopHomeBuiltinCapabilityItem` 与 `capabilities`；
- 增加 `DesktopHomeExtensionItem`、`extensionDiscovery` 与 `extensions`；
- bridge 从 `home.capabilities` 改为 `home.extensions`。

Main、preload、Renderer 和测试同时迁移。旧 payload/channel 不保留兼容分支。

### 7. Renderer 在 Home 请求前建立 sender-bound identity

Home management request 升级后必须携带当前 Desktop endpoint epoch。Renderer 入口在挂载 React 前并行完成基础 `bootstrap.get()` 与 settings 初始化；只有两者都完成后，Extensions Surface 才可能发起目录请求。preload 只接受 bootstrap 记住的 sender-bound identity，缺失或陈旧 epoch 直接失败，不回退当前 active window 或无 identity 请求。

## Risks / Trade-offs

- [Codex cache 布局属于外部产品边界] → Reader 接受显式注入 root，限定目录深度并提供 safe diagnostics；布局变化 fail-visible，不回退扫描任意目录。
- [config 未锁定插件版本] → 当前 reader 只接受唯一缓存版本；出现多个版本时不猜测 active version，返回 diagnostic。
- [用户可能把“已启用扩展”理解为 OpenNeko 可调用] → DTO 和 UI 不展示 runtime availability，扩展卡明确贡献类型；实际接入需独立 Plugin/MCP/Computer Use 变更。
- [manifest 文案在中文 UI 下可能仍为英文] → 第三方作者元数据保持原文；只本地化 Desktop 外壳与受控 builtin Skill。
- [插件 contribution locator 指向异常路径] → 只允许 plugin package 内相对路径，越界或 schema 错误时跳过并报告 diagnostic。

## Migration Plan

1. 先升级 contract 与 parser rejection tests。
2. 新增并测试 Codex extension catalog reader。
3. Main/preload 切换到 extension projection，删除 Shell domain mapping。
4. Renderer 启动先建立 sender-bound bootstrap identity，再切换导航、页签、搜索与 contribution 展示，删除 builtin capability copy/test。
5. 运行 Desktop 聚焦测试、typecheck/build、OpenSpec validation 与真实 Electron 双语场景。

本次只读用户的 Codex 配置和缓存，不写入、迁移或删除插件、Skill、设置或项目数据。

## Open Questions

动态 MCP tool 枚举需要 OpenNeko 组合真实 MCP Manager 并连接 server，不属于本次只读扩展目录。后续实现时必须复用现有 MCP runtime，不能从 manifest 静态伪造 tool availability。
