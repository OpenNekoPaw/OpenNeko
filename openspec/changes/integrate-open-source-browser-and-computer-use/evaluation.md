# Agent Evaluation Evidence

更新日期：2026-08-12

## Evaluation Scope

- Change：将 Browser Use/Cua 从固定版本、完整 Schema 摘要和资格状态管理，收敛为用户管理的外部
  runtime、最小结构兼容检查和真实执行权限边界。
- Authoring decision：`update agent-runtime.external-automation`。该 suite 继续拥有 Browser/Computer
  capability Tool routing、精确目标、调用拒绝、取消和 Tool result projection。
- Canonical path：用户启用 Plugin -> 明确授权外部 runtime -> MCP handshake/server name -> 所需 operation
  结构兼容 -> Automation exact session/target/mode -> product-owned Tool -> Pi Tool Call。
- Forbidden path：OpenNeko 执行安装命令、扫描 `PATH`、按固定第三方版本或完整 Schema digest 准入、暴露 raw
  Browser/Cua Tool、模型提交目标 identity、失败后切换 provider/runtime 或使用 direct turn runner/mock。

## Cases

- Updated：`browser-observe-selected-tab`、`browser-mutation-denied-in-observe-profile` 删除固定 Browser Use
  版本和“资格化”语义，保留兼容 operation、显式目标、观察证据和 raw/nested fallback rejection。
- Updated：`computer-observe-selected-window`、`computer-target-routing-fields-rejected`、
  `computer-observation-cancelled` 删除固定 Cua release 和“资格化”语义，保留签名/TCC owner、精确目标、
  Host 注入路由字段、取消和 raw fallback rejection；permission loss 与显式 Take over 由同一 Automation owner 的
  deterministic companion tests 验证，不伪造成当前 Desktop Evaluation harness 尚不支持的 UI step。
- Reused：`disabled-and-unknown-automation-tools` 继续证明 disabled/unavailable Plugin 不注册 Browser/Computer
  Tool，且不会自动安装、启用或模拟成功。
- Deterministic coverage：Extension canonical state、命令复制不执行、local runtime 状态、MCP operation
  compatibility、Browser/Cua release-string tolerance、Cua publisher/notarization 和 exact path identity 由 contracts、
  Node、Webview 和 Desktop tests 直接验证。

## Verification

- Key-free：`pnpm test:agent:eval` passed（45 files / 307 tests）；全 suite dry-run passed（25 suites / 74
  cases）。它们只证明 suite/schema/runner readiness。
- Real Browser/Computer cases：当前 production Automation provider/profile 注册仍未完成，无法从可见 Desktop
  用户路径创建真实 Browser/Cua Tool；保持 `infrastructure-blocked`，不以组件测试、mock、最终文本或 key-free
  dry-run 替代。
- Foundational Agent matrix：本批不改变 Conversation/session persistence、compaction、generation record、
  conversation switching 或 isolation owner，均为 unaffected；Tool registration 的受影响范围由
  `agent-runtime.external-automation` cases 拥有。

## Residual Risk

- Browser Use `uvx` 命令已按上游文档作为可复制文本提供，但 OpenNeko 不执行该命令，也不保证上游依赖、浏览器
  runtime 或模型凭据可用。
- 当前 Cua observe profile 只消费 Screen Recording；Accessibility 可查询并仅在显式请求时触发系统提示，Input
  Control 保持 unavailable，直到真实 interact profile 成为正确性消费者。bundle identifier、Team ID、Developer ID
  和 notarization 的 deterministic tests 不替代 TCC 行为验收。
- Browser 页面域绑定、真实 redirect/new-tab 行为、Computer mutation 和跨平台输入在 production provider
  registration 完成前均未获得真实行为证据。
