# Agent Evaluation Evidence

更新日期：2026-08-10

## Evaluation Scope

- 变更：审核固定的 Browser Use / Cua Driver MCP runtime、Automation session policy、Tool
  registration 与 result projection。
- Authoring decision：`create` `agent-runtime.external-automation`，但只能在真实 Desktop
  Automation Capability、用户授权 UI 和 session-owned process adapter 接通后创建并进入 coverage index。
- 需要真实 Evaluation 的原因：最终路径会改变 Capability/Tool 注册、permission、Tool Call lifecycle、
  cancellation 和 Desktop event projection。
- canonical path：reviewed extension/provider -> Automation session -> product-owned Capability Tool ->
  Tool Registry -> Pi Tool Call -> exact session MCP process。
- forbidden path：raw MCP Tool、共享 current browser session、nested Browser Use Agent、Computer Use fallback、
  direct turn runner、mock provider 或 fixture final text。

## Current Deterministic Evidence

- 官方 MCP SDK adapter 已覆盖 negotiation、cancellation、annotations、structured content、ordered mixed
  text/image result、malformed Tool isolation 和 sibling availability。
- Automation package 已覆盖 reviewed name/schema/annotation intersection、Browser Use observe allowlist、一次性
  exact session grant、extension enablement、当前 OS permission、target revalidation、single-action approval、
  replay rejection、step budget、sibling session isolation 和 transient image receipt。
- adapter-only MCP server 在 generic raw exposure 前被整体拒绝；debug exposure 选项不能绕过 server deny。
- Browser Use MCP call 必须携带 opaque `providerSessionId`；两个 Agent session 的调用不会通过隐式共享
  connection identity 路由。
- Desktop Main 已提供 Browser Use contained client factory：复用 canonical official-SDK `StdioMCPClient`，
  qualification 与每个 session 使用独立 HOME/TMP/config/cache/browser-data，cwd 固定到 session directory，
  环境不继承 Host secret，显式 config 不含 LLM，且 realpath 越界/symlink poison 在启动前失败。
- 每次 Automation action 现在都会重新查询 mode 所需 OS permission 并重校验 exact target；权限丢失或
  target mismatch 只暂停当前 session。一次性 mutation approval 在 Host 调用前消费，失败后不可重放。
- reviewed MCP provider 在 open 时冻结 exact target/mode；Cua Driver `verify_state` projector 拒绝模型声明
  pid/window/session，并从授权 target 注入这些字段。Computer observe 仅保留这一项 reviewed Tool。
- Agent Capability adapter 已绑定 exact profile、opaque targetKey、mode、timeout、budget 与
  conversation/run/toolCall owner，执行后关闭 owned session，结果不返回 pid/window/tab；provider 失败不尝试
  raw MCP 或另一 provider。
- transient observation store 使用 byte limit、TTL、exact session/action owner 与 single-consume；可持久化 receipt
  不含 raw screenshot bytes、Host path 或窗口 handle。
- Desktop Cua Driver client factory 只允许 macOS observe，使用 `mcp --direct` 与 approved bounded policy，
  不继承 Host environment；Windows 和 interact 在 factory boundary 直接 unavailable。
- bundled catalog source 现在可显示 Browser Use / Computer Use 的审核范围，但 artifact 未就绪时
  `canInstall=false`、`artifact-unavailable`，catalog refresh 不触发下载。
- 开发态真实 Electron 的 Extensions 页面已由 image-capable Computer Use 直接检查：Browser Use `0.13.7` 与
  Computer Use `0.19.2` 均显示审核范围、声明权限和 artifact unavailable diagnostic，没有安装入口。该检查
  只验证当前 UI 投影，不是 packaged runtime 或 Agent 行为证据。

## Real Cases

当前没有创建可执行 suite，也没有运行 provider-backed case。以下前置条件尚未满足：

- Desktop 用户首次 session 授权和 target/domain 选择 UI；
- installed Browser Use artifact resolver、contained client factory 的 production composition 与真实 process；
- production Agent Automation Capability registration、Host authorization target UI 与 Tool/Timeline projection；
- packaged Browser Use artifact 和真实 local fixture qualification；
- qualified Cua Driver macOS app/process/window observation path 与 OS permission fixture。

因此 Browser observe、mutation denial、Computer observe、wrong-target、cancel/takeover、visible Desktop 和
hidden complete-session cases 均为 `infrastructure-blocked`。Key-free schema validation也保持未执行，因为当前
创建 suite 只会制造无法走生产路径的虚假 case。

## Residual Risk

- 当前证据不证明 Browser Use 或 Computer Use 已在产品中可用。
- Browser Use `--mcp` 的单 browser session 语义要求每个 Automation session 独占进程；contained client
  factory 与 Capability adapter 已实现，但在 verified artifact resolver、Host authorization 与 production
  composition 接通前不得注册 Agent Tool。
- Cua Driver 已完成 exact observe schema/profile、target argument injection 和 contained bounded client factory；
  macOS target-only capture、TCC responsibility chain 和输入动作仍未资格化，Windows 保持 unavailable。
- 完成 Capability/UI/Desktop wiring 后必须补一条 visible Desktop + real provider 路径和一条 hidden
  complete Desktop + real provider 路径；deterministic 或 mock 结果不能替代。
