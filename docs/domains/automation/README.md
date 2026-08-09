# Automation 领域

Automation 负责把审核固定的浏览器或桌面控制 provider 收敛为 OpenNeko 唯一 Agent Tool Call 路径中的有界能力。它不实现浏览器控制、截图、OCR、键鼠注入、VLA 或第二套 Agent loop；具体机械能力由固定 release 的 Browser Use 与 Cua Driver MCP runtime 提供。

## Owner 与包

| Owner                         | 稳定职责                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neko/automation-contracts`  | provider/profile、exact target、session grant、mode/budget、action trait、approval、evidence 与 diagnostic 的 L0 canonical shape               |
| `@neko/automation-node`       | reviewed Tool/schema/annotation 交集、session 生命周期、step budget、目标与权限重校验、单动作 approval、MCP provider wrapper、瞬态 observation |
| `@neko/agent-runtime`         | 将 qualified Automation operation 适配为普通 Capability Tool，并绑定 conversation/run/toolCall owner；不暴露 raw MCP Tool                      |
| Extension application service | bundled catalog、制品安装/更新、enable grant、accepted permissions 和运行资格投影                                                              |
| Desktop Main                  | 下载/进程/窗口/TCC/资源的 concrete Host adapter 与 typed IPC；不拥有 Automation policy                                                         |
| Renderer                      | 展示扩展状态、授权选择和现有 Tool Call/Timeline 投影；不接收真实路径、secret、pid/window handle 或持久截图字节                                 |

## Canonical path

```text
signed first-party extension catalog
  -> explicit install and enable grant
  -> qualified provider/profile
  -> Agent Capability Tool
  -> canonical Tool Registry / Pi Tool Call / Approval
  -> exact Automation session and target
  -> one session-owned upstream MCP process
  -> transcript-safe evidence projection
```

同一意图只有这条成功路径。Automation extension 的 MCP server 必须使用 `adapter-only` exposure；unknown Tool、changed schema、contradictory annotation、disabled extension、失效 target 或 OS permission 都使当前 operation/session fail-local，不得改走 generic MCP、另一 provider 或 Computer Use fallback。

## 授权与数据边界

Install confirmation、enable grant、当前 OS permission、exact session grant 和 mutation approval 是不同 authority，互不替代。Session grant 绑定 provider/release、profile、target、mode、timeout、step budget 与 conversation/run/toolCall owner，消费一次后即使上游启动失败也不得重放。

Agent 参数只携带 Host 签发的 opaque `targetKey`；Host 授权端解析并返回 exact browser profile/session/tab/domain 或 application/process/window/region。完整 target 只存在于 Main/Automation runtime。Tool result 和 transcript 可保留 Tool action/session identity、profile、targetKey、label、mode、budget、状态和 evidence，但不投影浏览器或 OS handle；截图像素进入一次性 owner-bound transient receipt，过期、消费或 owning runtime 显式 release 后不可复用。Provider session 可以在 Tool 执行后关闭，receipt 必须保留到消费或 TTL 到期。

## Provider 基线

- Browser Use 固定 `0.13.7`，首个 `observe` reviewed profile 只允许 `browser_get_state`、`browser_get_html`、`browser_screenshot`、`browser_list_tabs`、`browser_list_sessions`。明确拒绝 `--cli-mcp`、`browser_exec`、`browser_extract_content`、nested upstream Agent、隐式 cloud、文件和未知操作。该 allowlist 不是 readiness：direct MCP 的空白 session 尚未与授权 exact origin/tab 绑定，redirect/new-tab 仍是事后处置，真实 observe、`browse-read` 与 `interact` 在资格化前保持 unavailable。
- Computer Use 固定 Cua Driver `0.19.2`。macOS 首个 profile 只审核 exact window `verify_state` observation，Host 注入 pid/window/session，bounded policy 只允许该 Tool，且要求当前 Screen Recording permission。Interact、Windows 和 Linux 在逐项资格化前保持 unavailable。

平台/制品/实机资格状态不是稳定架构事实，见 [`../../status/browser-computer-automation-2026-08-10.md`](../../status/browser-computer-automation-2026-08-10.md)。实施约束与剩余任务见 [`../../../openspec/changes/integrate-open-source-browser-and-computer-use/`](../../../openspec/changes/integrate-open-source-browser-and-computer-use/)。
