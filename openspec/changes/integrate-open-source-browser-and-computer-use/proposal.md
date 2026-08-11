## Why

OpenNeko 已具备 Pi Agent、Tool approval、MCP Manager 和 OpenNeko 扩展安装框架，但当前生产
Agent 只能调用内容读取 Tool 和已安装插件贡献的普通 MCP Tool。Browser Use、Computer Use 和
Play-use 都没有真实运行路径；现有 MCP client 还会丢失部分多模态结果和 Tool annotations，扩展
安装器也只能复制随应用打包的目录；Browser Use 与 Cua Driver 当前均没有经过产品资格化的真实
运行路径。

用户需要使用成熟开源实现，而不是在 OpenNeko 内重写浏览器或桌面控制引擎。设计必须把第三方
自动化内核、OpenNeko Agent 编排和 Desktop Host 权限边界分开，并且只在精确平台、运行时、权限、
目标和真实测试都通过后显示可用。

## What Changes

- 以官方 `@modelcontextprotocol/sdk` 替换当前手写 MCP transport/client；保留 OpenNeko
  `MCPManager -> ToolRegistry -> Pi` 产品路径，完整保留 MCP Tool annotations、结构化文本/图片结果、
  protocol negotiation、取消和连接 diagnostics。
- 将扩展包生命周期与自动化运行时来源拆开。首期 Browser Use 与 Cua Driver 使用
  `user-managed-local-runtime`：用户按上游官方方式安装、更新和卸载；OpenNeko 只授权精确本地 runtime、校验固定
  release/签名/MCP schema、启动并终止当前 session 自己拥有的子进程。OpenNeko 不执行远程
  shell/pip/uv/npm/curl 安装命令，不扫描 `PATH`，也不自动切换到托管 artifact 或其他本地安装。
- 保留静态可信 catalog、显式 enable grant、checksum/signature/SBOM 与托管 artifact 安装 contract，作为未来
  可选交付来源；它不阻塞首期用户管理本地运行时，也不与该来源互为 fallback。Extensions 对本地运行时只
  提供官方安装指南、选择/授权、重新检查和断开，不提供安装、更新或卸载动作。
- 提供第一方 `browser-use` 扩展，固定使用 MIT 许可的
  [`browser-use/browser-use`](https://github.com/browser-use/browser-use) 上游 MCP server
  `browser-use --mcp`。OpenNeko 不实现 DOM、Playwright/CDP 控制或第二套 Browser Agent。
- 提供第一方 `computer-use` 扩展，固定使用 MIT 许可的
  [`trycua/cua`](https://github.com/trycua/cua) Cua Driver MCP。OpenNeko 不实现截图、窗口驱动、
  Accessibility/Input 或坐标执行引擎。
- 新增 `@neko/automation-contracts` 与 `@neko/automation-node`，分别拥有自动化 profile/session/evidence
  contract 和 host-neutral session policy/target binding application service；Desktop Main 只实现
  下载、进程、平台权限、窗口身份和短生命周期资源 concrete adapter。
- Browser Use 首先支持隔离浏览器 profile 下的 observe、browse-read 和 interact 三种显式等级；
  `--cli-mcp`、`browser_exec`、`browser_extract_content`、`retry_with_browser_use_agent`、任意 Python 执行、
  上游嵌套 Agent、任意文件系统和隐式复用用户浏览器 profile 均禁止；Browser Use 进程不接收模型 API
  凭据，页面理解只由 OpenNeko Pi 完成。
- Computer Use 首先资格化 `darwin-arm64` 的精确 app/process/window observe 路径，再资格化输入动作；
  Windows 只有在 OpenNeko Windows 产品发布和 Cua Driver 实机矩阵完成后才可标记支持。
- 所有状态改变操作复用既有 Pi Tool Call、permission、approval、cancel 和 Timeline；MCP/API 失败不得
  自动切换到 Computer Use，Computer Use 不创建第二套 GUI Agent 或 Task runtime。
- 授权拆分为安装确认、扩展 enable grant、Host 查询的 OS 权限、精确目标 automation session 和单次
  mutation approval；安装或 OS grant 均不能替代 Tool Call 授权，未知 Tool 在任何 Agent 模式下都不注册。
- 每个自动化进程使用扩展私有的 home/temp/data 目录和精确环境 allowlist，不继承真实用户 `HOME`、通用
  `PATH`、模型凭据或未声明 secret。Browser Use 的 Python/MCP entrypoint 与浏览器 executable 是两个独立
  的精确授权；Cua macOS 首期只接受签名、公证且具有稳定 TCC responsibility chain 的
  `/Applications/CuaDriver.app`。用户管理的 runtime 不由 OpenNeko 删除。
- 增加真实 Desktop Agent Evaluation：正确 Tool 路由、只读边界、审批拒绝、错误隔离、截图证据、
  目标失配、取消、接管、恢复和无 fallback。

## Capabilities

### New Capabilities

- `agent-browser-computer-automation`: 通过审核并资格化的开源 MCP runtime 为 Pi Agent 提供 Browser Use 与
  qualified Computer Use，并以精确 session/target、操作风险、审批、证据和平台资格控制可用性。

### Modified Capabilities

- `desktop-home-management-surfaces`: Extensions 增加独立的 runtime source、显式 enablement、依赖、OS 权限和
  runtime qualification 状态；用户管理本地运行时只显示指南、授权、复查和断开，仍不得把 manifest、路径
  存在或下载完成当成 Agent ready。

## Impact

- `packages/agent/contracts`：以单一 canonical MCP shape 表达 Tool annotations、多模态 result 和安全
  diagnostics；不增加内部 contract/schema version。
- `packages/agent/runtime/src/mcp`：官方 MCP SDK adapter、structured result、连接/取消/协议协商；删除
  手写 JSON-RPC transport 成功路径。
- `packages/agent/runtime/src/extensions`：可信 catalog、独立 enable grant、runtime source 引用和 automation
  contribution composition；未来托管 artifact repository/receipt 仍由 Agent extension application service
  拥有，但不承担用户管理本地 runtime 的文件生命周期。
- `packages/automation/contracts`：L0 profile、session、target、action trait、evidence 与 diagnostic。
- `packages/automation/node`：L1 host-neutral Browser/Computer session application service、Tool wrapper、
  target revalidation、budget、takeover 和 result policy。
- `apps/neko-desktop`：薄组合根中的 network/file/process/TCC/Accessibility/window adapter、typed IPC、
  app lifecycle、打包和真实平台 fixture；不得拥有自动化策略或业务完成判断。
- `apps/neko-desktop/resources/extension-marketplace`：只打包 catalog/metadata 与官方安装指南引用；首期不打包、
  下载或安装第三方 runtime，未来可在完成签名和资格门禁后加入固定托管 artifact。
- `packages/agent/webview`：Extensions 的安装/启用/更新/权限状态，以及 Agent Timeline 中的自动化 session、
  Pause、Stop、Take over、审批和证据投影。
- `scripts/agent-eval`：新增自动化 capability suite、Desktop facts/assertions 和本地真实运行矩阵。

用户项目、Workspace、Agent transcript 和其他应用的插件/配置不迁移。断开用户管理 runtime 只删除
OpenNeko 的授权引用，不删除上游安装；资格失败、停用或运行时变化只影响对应扩展和自动化 session。
