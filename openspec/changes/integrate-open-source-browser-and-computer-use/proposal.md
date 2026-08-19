## Why

> **Successor disposition (2026-08-20):** `replace-pi-with-dsh-runtime-atomically` supersedes this change's OpenNeko Plugin catalog, Skill Host, MCP Manager, Tool Registry, Pi Tool Call and production Automation composition. Browser Use/Cua upstream compatibility, exact target, OS permission, action approval and evidence rules remain input to the successor, but no task or requirement here authorizes a production success path. The successor owns DSH MCP contribution wiring, deletion of old registrations/contracts and new Evaluation evidence.

OpenNeko 已具备 Plugin、Skill、MCP Manager、Pi Tool Call 与 Desktop Host 权限边界，但 Browser Use、
Computer Use 仍被设计成一套 OpenNeko 专有的发布、资格和权限管理体系。该体系要求固定版本、完整
Schema 摘要、声明权限接受和多维资格状态，却没有为普通第三方 Plugin、Skill、MCP 提供同等开放的
接入路径，也把兼容性判断误呈现成安全保证。

当前阶段应优先交付公开、通用、可组合的扩展接入：用户或第三方按上游方式安装和维护依赖，OpenNeko
提供可复制命令、标准发现/加载、明确诊断与真实运行时权限边界，不承担第三方效果认证，也不建立插件
市场式的资格治理平台。

## What Changes

- Plugin 作为公开贡献载体，可声明 Skill、普通 MCP 和 App；OpenNeko 只负责发现、启停、加载与局部错误
  展示。启用本身就是加载授权，不再维护声明权限/接受权限矩阵。
- Skill 遵循公开目录与 `SKILL.md` 约定；个人、第三方和 OpenNeko Skill 使用同一发现机制。项目 Skill
  继续受 Workspace Trust 约束，`allowed-tools` 只缩小工具范围，外部脚本继续经过真实执行授权。
- 普通 MCP 使用标准 MCP SDK，经唯一 `MCPManager -> ToolRegistry -> Pi Tool Call` 路径连接、枚举和调用；
  不要求 OpenNeko 资格认证、固定包版本或完整 Tool Schema 摘要。
- Browser Use 与 Cua Driver 首期使用用户管理的外部原生依赖。OpenNeko 展示并允许复制上游安装命令，
  用户显式选择运行时；OpenNeko 不执行安装命令、不扫描 `PATH`、不更新或删除上游文件。
- Browser/CUA adapter 只检查真实依赖的兼容边界：精确授权路径、MCP server 身份、所需 operation 是否
  存在、adapter 使用字段是否结构兼容，以及 CUA 的 macOS bundle/signature/TCC 身份。第三方版本用于
  展示和诊断，不作为默认成功门禁；未知操作仍不会进入产品拥有的 Automation wrapper。
- Extensions UI 只展示未安装/已安装、禁用/启用、可用/错误和可执行操作，不显示“已资格化”“未验证”、
  dependency/permission/qualification 状态矩阵或声明权限列表。
- 安全继续由真实边界拥有：插件启停、Tool 调用确认、OS 权限、精确 Automation session/target 和单次
  mutation approval。任何层都不得由版本、Skill 文本、MCP annotation 或成功字符串替代。
- 保留官方 MCP SDK、多模态 Tool result、敏感观察临时投影、精确目标绑定、Pause/Stop/Take over 与
  fail-local diagnostics；不实现第二套浏览器、桌面控制或 Agent runtime。
- 已完成的 managed-artifact 构建与供应链研究保留为历史证据，但不再属于当前交付或 Extensions 公共
  管理 contract；未来如要由 OpenNeko 下载、安装和更新第三方 runtime，必须单独提出变更。
- 当前 Extensions 目录不暴露远程 Plugin 下载、更新候选、传输进度、提交/回滚或 Marketplace 刷新语义。
  用户放入受支持目录的 Plugin 由同一发现路径加载；OpenNeko 只管理自身持有的启用状态和可明确归属的
  本地副本移除，不推断或接管上游包管理器生命周期。
- Browser/CUA 当前只接受一个用户明确选择的本地 runtime。普通远程 MCP 仍属于通用 MCP Manager；不得
  为 Browser/CUA 保留一条并行的专用 endpoint 配置与成功路径。
- 第三方 release 可以作为可选诊断事实显示，但不得成为 Automation provider、session、授权或缓存 identity，
  也不得成为所有 provider 必须提供的公共字段。

## Capabilities

### New Capabilities

- `agent-browser-computer-automation`: 通过用户安装的 Browser Use/Cua MCP runtime 提供产品拥有的
  Browser/Computer adapter，并以标准 Tool Call、精确目标、系统权限和动作审批控制实际操作。

### Modified Capabilities

- `desktop-home-management-surfaces`: Extensions 收敛为开放扩展加载与诊断入口；为外部依赖显示安装指南、
  可复制命令、选择/重新选择和断开，不显示资格或声明权限管理矩阵。

## Impact

- `packages/agent/contracts` / `packages/agent/runtime/src/extensions`：收敛 Extension 公共状态和启用持久化，
  删除没有 enforcement consumer 的权限接受、资格投影和未组合的远程 artifact 生命周期。
- `packages/agent/runtime/src/mcp`：继续使用官方 MCP SDK 和唯一 Tool Registry/Pi 路径。
- `packages/automation/contracts` / `packages/automation/node`：以 operation 名称和最小结构兼容性代替完整
  Schema digest 认证；版本仅作为可选第三方诊断事实，不进入 provider/session identity。
- `apps/neko-desktop`：提供精确本地资源选择、安装命令复制、进程/OS 权限/窗口 concrete adapter；不拥有
  Automation 策略，不执行第三方安装。
- `packages/agent/webview` / `packages/automation/webview`：删除资格标签和状态矩阵，只呈现动作与错误。

用户项目、Workspace、Agent transcript 和第三方安装文件均不迁移。单个 Plugin、Skill、MCP、runtime 或
Tool 失败只影响自身；其他扩展、会话和 Workspace 保持可用。
